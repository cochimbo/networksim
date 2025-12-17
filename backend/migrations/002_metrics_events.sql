-- Migration: Add metrics and events tables for historical data and live monitoring

-- Network metrics table - stores periodic measurements between nodes
CREATE TABLE IF NOT EXISTS network_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topology_id TEXT NOT NULL,
    source_node_id TEXT NOT NULL,
    target_node_id TEXT NOT NULL,
    -- Metrics
    latency_ms REAL,                    -- Round-trip time in milliseconds
    packet_loss_percent REAL,           -- Packet loss percentage (0-100)
    bandwidth_bps REAL,                 -- Bandwidth in bits per second
    jitter_ms REAL,                     -- Jitter in milliseconds
    -- Status
    is_connected INTEGER NOT NULL DEFAULT 1,  -- 1 = connected, 0 = blocked
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
    cpu_usage_percent REAL,             -- CPU usage (0-100)
    memory_usage_bytes INTEGER,         -- Memory usage in bytes
    memory_limit_bytes INTEGER,         -- Memory limit in bytes
    -- Network I/O
    rx_bytes INTEGER,                   -- Received bytes
    tx_bytes INTEGER,                   -- Transmitted bytes
    rx_packets INTEGER,                 -- Received packets
    tx_packets INTEGER,                 -- Transmitted packets
    -- Status
    status TEXT NOT NULL DEFAULT 'unknown',  -- running, pending, failed, etc.
    -- Timestamp
    measured_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (topology_id) REFERENCES topologies(id) ON DELETE CASCADE
);

-- Events table - stores all system events for timeline/audit
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topology_id TEXT,                   -- Can be null for system events
    event_type TEXT NOT NULL,           -- Event category
    event_subtype TEXT,                 -- Specific event type
    severity TEXT NOT NULL DEFAULT 'info',  -- info, warning, error, success
    title TEXT NOT NULL,                -- Short description
    description TEXT,                   -- Detailed description
    metadata TEXT,                      -- JSON with additional data
    -- Source information
    source_type TEXT,                   -- node, link, chaos, deployment, system
    source_id TEXT,                     -- ID of the source entity
    -- Timestamp
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (topology_id) REFERENCES topologies(id) ON DELETE CASCADE
);

-- Chaos presets table - predefined chaos configurations
CREATE TABLE IF NOT EXISTS chaos_presets (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'custom',  -- latency, loss, bandwidth, partition, mixed
    icon TEXT,                          -- Emoji or icon name
    -- Chaos configuration (JSON)
    chaos_type TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'to',
    duration TEXT,
    params TEXT NOT NULL,               -- JSON with type-specific params
    -- Metadata
    is_builtin INTEGER NOT NULL DEFAULT 0,  -- 1 = system preset, 0 = user preset
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Test runs table - stores test execution history
CREATE TABLE IF NOT EXISTS test_runs (
    id TEXT PRIMARY KEY NOT NULL,
    topology_id TEXT NOT NULL,
    test_type TEXT NOT NULL,            -- diagnostic, chaos_validation, smoke, custom
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, running, passed, failed, cancelled
    -- Results
    total_tests INTEGER DEFAULT 0,
    passed_tests INTEGER DEFAULT 0,
    failed_tests INTEGER DEFAULT 0,
    -- Timing
    started_at TEXT,
    completed_at TEXT,
    duration_ms INTEGER,
    -- Results data (JSON)
    results TEXT,
    error_message TEXT,
    -- Metadata
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (topology_id) REFERENCES topologies(id) ON DELETE CASCADE
);

-- Indexes for efficient querying
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

-- Insert built-in chaos presets
-- Note: direction must be 'to' (egress) when no target is specified - Chaos Mesh requirement
INSERT OR IGNORE INTO chaos_presets (id, name, description, category, icon, chaos_type, direction, duration, params, is_builtin) VALUES
('preset-high-latency', 'High Latency', 'Add 200ms latency with 50ms jitter', 'latency', '🐢', 'delay', 'to', NULL, '{"latency": "200ms", "jitter": "50ms"}', 1),
('preset-moderate-latency', 'Moderate Latency', 'Add 100ms latency with 20ms jitter', 'latency', '⏱️', 'delay', 'to', NULL, '{"latency": "100ms", "jitter": "20ms"}', 1),
('preset-packet-storm', 'Packet Loss Storm', '50% packet loss - severe conditions', 'loss', '🌪️', 'loss', 'to', NULL, '{"loss": "50"}', 1),
('preset-flaky-network', 'Flaky Network', '10% packet loss - intermittent issues', 'loss', '📉', 'loss', 'to', NULL, '{"loss": "10", "correlation": "25"}', 1),
('preset-bandwidth-limit', 'Bandwidth Limit', 'Limit to 1Mbps - slow connection', 'bandwidth', '📊', 'bandwidth', 'to', NULL, '{"rate": "1mbps", "buffer": 10000}', 1),
('preset-network-partition', 'Network Partition', 'Complete network disconnect', 'partition', '🚫', 'partition', 'to', NULL, '{}', 1),
('preset-data-corruption', 'Data Corruption', '5% packet corruption', 'corruption', '🔧', 'corrupt', 'to', NULL, '{"corrupt": "5"}', 1),
('preset-chaos-monkey', 'Chaos Monkey', 'Random issues: 100ms latency + 5% loss', 'mixed', '🐒', 'delay', 'to', NULL, '{"latency": "100ms", "jitter": "30ms"}', 1);
