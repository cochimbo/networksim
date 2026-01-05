-- Migración inicial completa
CREATE TABLE IF NOT EXISTS topologies (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    description TEXT,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY NOT NULL,
    topology_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    deploy_command_state TEXT NOT NULL DEFAULT 'pending',
    k8s_resources TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (topology_id) REFERENCES topologies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY NOT NULL,
    topology_id TEXT NOT NULL,
    node_selector TEXT,
    image_name TEXT, -- <--- columna agregada para el backend
    chart_reference TEXT,
    chart_type TEXT, -- <--- columna agregada
    chart TEXT,
    namespace TEXT,
    envvalues TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    release_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (topology_id) REFERENCES topologies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chaos_conditions (
    id TEXT PRIMARY KEY NOT NULL,
    topology_id TEXT NOT NULL,
    source_node_id TEXT NOT NULL,
    target_node_id TEXT,
    chaos_type TEXT NOT NULL,
    direction TEXT NOT NULL,
    duration TEXT,
    params TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    k8s_name TEXT,
    started_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (topology_id) REFERENCES topologies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY NOT NULL,
    description TEXT,
    topology_id TEXT,
    events TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (topology_id) REFERENCES topologies(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_deployments_topology ON deployments(topology_id);
CREATE INDEX IF NOT EXISTS idx_deployments_command_state ON deployments(deploy_command_state);
CREATE INDEX IF NOT EXISTS idx_chaos_topology ON chaos_conditions(topology_id);
CREATE INDEX IF NOT EXISTS idx_applications_topology ON applications(topology_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_topology ON scenarios(topology_id);

-- ======================================================
-- Metrics, Events, Chaos Presets and Test Runs (merged)
-- ======================================================

-- Network metrics table - stores periodic measurements between nodes
CREATE TABLE IF NOT EXISTS network_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topology_id TEXT NOT NULL,
    source_node_id TEXT NOT NULL,
    target_node_id TEXT NOT NULL,
    -- Metrics
    latency_ms REAL,
    packet_loss_percent REAL,
    bandwidth_bps REAL,
    jitter_ms REAL,
    -- Status
    is_connected INTEGER NOT NULL DEFAULT 1,
    -- Timestamp
    measured_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (topology_id) REFERENCES topologies(id) ON DELETE CASCADE
);

-- Node metrics table - stores node-level metrics (CPU, memory, network I/O)
CREATE TABLE IF NOT EXISTS node_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topology_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    pod_name TEXT,
    -- Resource metrics
    cpu_usage_percent REAL,
    memory_usage_bytes INTEGER,
    memory_limit_bytes INTEGER,
    -- Network I/O
    rx_bytes INTEGER,
    tx_bytes INTEGER,
    rx_packets INTEGER,
    tx_packets INTEGER,
    -- Status
    status TEXT NOT NULL DEFAULT 'unknown',
    -- Timestamp
    measured_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (topology_id) REFERENCES topologies(id) ON DELETE CASCADE
);

-- Events table - stores all system events for timeline/audit
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topology_id TEXT,
    event_type TEXT NOT NULL,
    event_subtype TEXT,
    severity TEXT NOT NULL DEFAULT 'info',
    title TEXT NOT NULL,
    description TEXT,
    metadata TEXT,
    source_type TEXT,
    source_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (topology_id) REFERENCES topologies(id) ON DELETE CASCADE
);

-- Chaos presets table - predefined chaos configurations
CREATE TABLE IF NOT EXISTS chaos_presets (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'custom',
    icon TEXT,
    chaos_type TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'to',
    duration TEXT,
    params TEXT NOT NULL,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Test runs table - stores test execution history
CREATE TABLE IF NOT EXISTS test_runs (
    id TEXT PRIMARY KEY NOT NULL,
    topology_id TEXT NOT NULL,
    test_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    total_tests INTEGER DEFAULT 0,
    passed_tests INTEGER DEFAULT 0,
    failed_tests INTEGER DEFAULT 0,
    started_at TEXT,
    completed_at TEXT,
    duration_ms INTEGER,
    results TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (topology_id) REFERENCES topologies(id) ON DELETE CASCADE
);

-- Indexes for metrics/events/test_runs
CREATE INDEX IF NOT EXISTS idx_network_metrics_topology ON network_metrics(topology_id);
CREATE INDEX IF NOT EXISTS idx_network_metrics_time ON network_metrics(measured_at);
CREATE INDEX IF NOT EXISTS idx_network_metrics_nodes ON network_metrics(source_node_id, target_node_id);
CREATE INDEX IF NOT EXISTS idx_node_metrics_topology ON node_metrics(topology_id);
CREATE INDEX IF NOT EXISTS idx_node_metrics_time ON node_metrics(measured_at);
CREATE INDEX IF NOT EXISTS idx_node_metrics_node ON node_metrics(node_id);

CREATE INDEX IF NOT EXISTS idx_events_topology ON events(topology_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_time ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);

CREATE INDEX IF NOT EXISTS idx_test_runs_topology ON test_runs(topology_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_status ON test_runs(status);

-- Seed built-in chaos presets (network / basic)
INSERT OR IGNORE INTO chaos_presets (id, name, description, category, icon, chaos_type, direction, duration, params, is_builtin, created_at, updated_at) VALUES
('preset-high-latency', 'High Latency', 'Add 200ms latency with 50ms jitter', 'latency', '🐢', 'delay', 'to', NULL, '{"latency": "200ms", "jitter": "50ms"}', 1, datetime('now'), datetime('now')),
('preset-moderate-latency', 'Moderate Latency', 'Add 100ms latency with 20ms jitter', 'latency', '⏱️', 'delay', 'to', NULL, '{"latency": "100ms", "jitter": "20ms"}', 1, datetime('now'), datetime('now')),
('preset-packet-storm', 'Packet Loss Storm', '50% packet loss - severe conditions', 'loss', '🌪️', 'loss', 'to', NULL, '{"loss": "50"}', 1, datetime('now'), datetime('now')),
('preset-flaky-network', 'Flaky Network', '10% packet loss - intermittent issues', 'loss', '📉', 'loss', 'to', NULL, '{"loss": "10", "correlation": "25"}', 1, datetime('now'), datetime('now')),
('preset-bandwidth-limit', 'Bandwidth Limit', 'Limit to 1Mbps - slow connection', 'bandwidth', '📊', 'bandwidth', 'to', NULL, '{"rate": "1mbps", "buffer": 10000}', 1, datetime('now'), datetime('now')),
('preset-network-partition', 'Network Partition', 'Complete network disconnect', 'partition', '🚫', 'partition', 'to', NULL, '{}', 1, datetime('now'), datetime('now')),
('preset-data-corruption', 'Data Corruption', '5% packet corruption', 'corruption', '🔧', 'corrupt', 'to', NULL, '{"corrupt": "5"}', 1, datetime('now'), datetime('now')),
('preset-chaos-monkey', 'Chaos Monkey', 'Random issues: 100ms latency + 5% loss', 'mixed', '🐒', 'delay', 'to', NULL, '{"latency": "100ms", "jitter": "30ms"}', 1, datetime('now'), datetime('now'));

-- Seed built-in presets for stress, pod, io and http chaos types
INSERT OR IGNORE INTO chaos_presets (id, name, description, category, icon, chaos_type, direction, duration, params, is_builtin) VALUES
('preset-stress-high', 'High CPU Load', 'Stress CPU at 80% load with 2 workers', 'stress', '💻', 'stress-cpu', 'to', '60s', '{"load": 80, "workers": 2}', 1),
('preset-stress-spike', 'CPU Spike', 'Maximum CPU stress - 100% load with 4 workers', 'stress', '🔥', 'stress-cpu', 'to', '30s', '{"load": 100, "workers": 4}', 1),
('preset-stress-light', 'Light CPU Load', 'Light CPU stress at 30% - background noise', 'stress', '⚡', 'stress-cpu', 'to', '120s', '{"load": 30, "workers": 1}', 1),
('preset-pod-kill', 'Pod Restart', 'Kill pod immediately (gracePeriod=0)', 'pod', '💀', 'pod-kill', 'to', NULL, '{"grace_period": 0}', 1),
('preset-pod-graceful', 'Graceful Pod Kill', 'Kill pod with 30s grace period', 'pod', '☠️', 'pod-kill', 'to', NULL, '{"grace_period": 30}', 1),
('preset-io-slow', 'Slow Disk', 'Add 100ms latency to disk operations', 'io', '💾', 'io-delay', 'to', '60s', '{"delay": "100ms", "percent": 100}', 1),
('preset-io-timeout', 'Disk Timeout', 'Extreme disk latency (5s) - simulate disk failure', 'io', '🔴', 'io-delay', 'to', '30s', '{"delay": "5s", "percent": 100}', 1),
('preset-io-intermittent', 'Intermittent I/O', '500ms delay on 50% of operations', 'io', '📁', 'io-delay', 'to', '60s', '{"delay": "500ms", "percent": 50}', 1),
('preset-http-500', 'API Failure (500)', 'Return HTTP 500 Internal Server Error', 'http', '🌐', 'http-abort', 'to', '60s', '{"code": 500}', 1),
('preset-http-429', 'Rate Limit (429)', 'Simulate rate limiting with HTTP 429', 'http', '🚦', 'http-abort', 'to', '60s', '{"code": 429}', 1),
('preset-http-503', 'Service Unavailable', 'Return HTTP 503 Service Unavailable', 'http', '🔌', 'http-abort', 'to', '60s', '{"code": 503}', 1),
('preset-http-timeout', 'Gateway Timeout', 'Return HTTP 504 Gateway Timeout', 'http', '⏰', 'http-abort', 'to', '60s', '{"code": 504}', 1);

-- Registry configurations
CREATE TABLE IF NOT EXISTS registry_configs (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    username TEXT,
    password TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    is_insecure INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);


