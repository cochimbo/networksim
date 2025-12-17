//! Performance benchmarks for NetworkSim backend
//!
//! Run with: cargo bench

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use serde_json::json;

/// Benchmark topology JSON serialization/deserialization
fn bench_topology_serialization(c: &mut Criterion) {
    let mut group = c.benchmark_group("topology_serialization");

    // Different topology sizes
    for node_count in [10, 50, 100, 500].iter() {
        let nodes: Vec<_> = (0..*node_count)
            .map(|i| {
                json!({
                    "id": format!("node-{}", i),
                    "name": format!("Node {}", i),
                    "position": {"x": (i * 50) as f64, "y": (i * 30) as f64},
                    "config": {"image": "alpine:latest"}
                })
            })
            .collect();

        // Create links (each node connected to next)
        let links: Vec<_> = (0..*node_count - 1)
            .map(|i| {
                json!({
                    "id": format!("link-{}", i),
                    "source": format!("node-{}", i),
                    "target": format!("node-{}", i + 1),
                    "properties": {"bandwidth": "100Mbps"}
                })
            })
            .collect();

        let topology = json!({
            "id": "bench-topology",
            "name": "Benchmark Topology",
            "nodes": nodes,
            "links": links
        });

        group.throughput(Throughput::Elements(*node_count as u64));

        // Benchmark serialization
        group.bench_with_input(
            BenchmarkId::new("serialize", node_count),
            &topology,
            |b, topo| {
                b.iter(|| serde_json::to_string(black_box(topo)).unwrap());
            },
        );

        // Benchmark deserialization
        let json_str = serde_json::to_string(&topology).unwrap();
        group.bench_with_input(
            BenchmarkId::new("deserialize", node_count),
            &json_str,
            |b, json| {
                b.iter(|| {
                    serde_json::from_str::<serde_json::Value>(black_box(json)).unwrap()
                });
            },
        );
    }

    group.finish();
}

/// Benchmark chaos condition creation
fn bench_chaos_condition_creation(c: &mut Criterion) {
    let mut group = c.benchmark_group("chaos_conditions");

    let chaos_types = vec![
        ("delay", json!({"latency": "100ms", "jitter": "10ms"})),
        ("loss", json!({"loss": "25", "correlation": "50"})),
        ("bandwidth", json!({"rate": "1mbps", "buffer": 10000})),
        ("partition", json!({})),
    ];

    for (chaos_type, params) in chaos_types {
        let request = json!({
            "topology_id": "test-topology",
            "source_node_id": "node-1",
            "target_node_id": "node-2",
            "chaos_type": chaos_type,
            "direction": "to",
            "duration": "60s",
            "params": params
        });

        group.bench_with_input(
            BenchmarkId::new("create_request", chaos_type),
            &request,
            |b, req| {
                b.iter(|| serde_json::to_string(black_box(req)).unwrap());
            },
        );
    }

    group.finish();
}

/// Benchmark link validation (checking all links reference valid nodes)
fn bench_link_validation(c: &mut Criterion) {
    let mut group = c.benchmark_group("link_validation");

    for size in [10, 100, 1000].iter() {
        let node_ids: Vec<String> = (0..*size).map(|i| format!("node-{}", i)).collect();
        let links: Vec<(String, String)> = (0..*size - 1)
            .map(|i| (format!("node-{}", i), format!("node-{}", i + 1)))
            .collect();

        group.throughput(Throughput::Elements(*size as u64));

        group.bench_with_input(
            BenchmarkId::new("validate_links", size),
            &(&node_ids, &links),
            |b, (nodes, links)| {
                b.iter(|| {
                    for (source, target) in links.iter() {
                        let _ = black_box(nodes.contains(source) && nodes.contains(target));
                    }
                });
            },
        );
    }

    group.finish();
}

/// Benchmark UUID generation (used for topology/node IDs)
fn bench_uuid_generation(c: &mut Criterion) {
    c.bench_function("uuid_v4_generation", |b| {
        b.iter(|| {
            let id = uuid::Uuid::new_v4();
            black_box(id.to_string())
        });
    });
}

/// Benchmark position calculation (used in topology editor)
fn bench_position_calculations(c: &mut Criterion) {
    let mut group = c.benchmark_group("position_calculations");

    let positions: Vec<(f64, f64)> = (0..1000).map(|i| (i as f64 * 1.5, i as f64 * 2.3)).collect();

    // Benchmark distance calculation
    group.bench_function("distance_calculation", |b| {
        b.iter(|| {
            for window in positions.windows(2) {
                let (x1, y1) = window[0];
                let (x2, y2) = window[1];
                let distance = black_box(((x2 - x1).powi(2) + (y2 - y1).powi(2)).sqrt());
                let _ = distance;
            }
        });
    });

    // Benchmark bounding box calculation
    group.bench_function("bounding_box", |b| {
        b.iter(|| {
            let (min_x, max_x, min_y, max_y) = positions.iter().fold(
                (f64::MAX, f64::MIN, f64::MAX, f64::MIN),
                |(min_x, max_x, min_y, max_y), &(x, y)| {
                    (min_x.min(x), max_x.max(x), min_y.min(y), max_y.max(y))
                },
            );
            black_box((min_x, max_x, min_y, max_y))
        });
    });

    group.finish();
}

/// Benchmark JSON path extraction (used when parsing K8s responses)
fn bench_json_path_extraction(c: &mut Criterion) {
    let k8s_response = json!({
        "metadata": {
            "name": "test-pod",
            "namespace": "networksim-sim",
            "labels": {
                "networksim.io/topology": "topo-123",
                "networksim.io/node": "node-1"
            }
        },
        "status": {
            "phase": "Running",
            "conditions": [
                {"type": "Ready", "status": "True"},
                {"type": "ContainersReady", "status": "True"}
            ],
            "podIP": "10.42.0.15"
        }
    });

    c.bench_function("extract_pod_info", |b| {
        b.iter(|| {
            let name = k8s_response["metadata"]["name"].as_str();
            let namespace = k8s_response["metadata"]["namespace"].as_str();
            let topology = k8s_response["metadata"]["labels"]["networksim.io/topology"].as_str();
            let phase = k8s_response["status"]["phase"].as_str();
            let ip = k8s_response["status"]["podIP"].as_str();
            black_box((name, namespace, topology, phase, ip))
        });
    });
}

criterion_group!(
    benches,
    bench_topology_serialization,
    bench_chaos_condition_creation,
    bench_link_validation,
    bench_uuid_generation,
    bench_position_calculations,
    bench_json_path_extraction,
);

criterion_main!(benches);
