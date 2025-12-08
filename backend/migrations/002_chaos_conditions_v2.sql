-- Migration: Update chaos_conditions table structure
-- Adds topology_id, status field, and more detailed tracking

-- Drop old table and recreate with new structure
DROP TABLE IF EXISTS chaos_conditions;

CREATE TABLE IF NOT EXISTS chaos_conditions (
    id TEXT PRIMARY KEY NOT NULL,
    topology_id TEXT NOT NULL,
    source_node_id TEXT NOT NULL,
    target_node_id TEXT,  -- NULL means "all other nodes"
    chaos_type TEXT NOT NULL,  -- delay, loss, bandwidth, corrupt, duplicate, partition
    direction TEXT NOT NULL DEFAULT 'to',  -- to, from, both
    duration TEXT,  -- NULL means indefinite
    params TEXT NOT NULL,  -- JSON params (latency, loss_percent, etc.)
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, active, paused
    k8s_name TEXT,  -- Name of the K8s NetworkChaos resource when active
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (topology_id) REFERENCES topologies(id) ON DELETE CASCADE
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_chaos_topology ON chaos_conditions(topology_id);
CREATE INDEX IF NOT EXISTS idx_chaos_status ON chaos_conditions(status);
