-- Migration: Fix applications table schema for topology-wide deployments
-- Make node_id nullable to allow new topology-wide application records

-- Create new table with corrected schema
CREATE TABLE applications_temp (
    id TEXT PRIMARY KEY NOT NULL,
    node_id TEXT,  -- Made nullable for topology-wide deployments
    topology_id TEXT NOT NULL,
    name TEXT NOT NULL,
    chart TEXT NOT NULL,
    version TEXT,
    namespace TEXT NOT NULL DEFAULT 'default',
    "values" TEXT,  -- JSON values for Helm chart
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, deploying, deployed, failed, uninstalling
    release_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    node_selector TEXT,  -- JSON array of node IDs
    chart_type TEXT DEFAULT 'predefined',  -- 'predefined' or 'custom'
    chart_reference TEXT,  -- Full chart reference (repo/chart or just name)
    FOREIGN KEY (topology_id) REFERENCES topologies(id) ON DELETE CASCADE
);

-- Copy data from old table to new table
INSERT INTO applications_temp (id, node_id, topology_id, name, chart, version, namespace, "values", status, release_name, created_at, updated_at, node_selector, chart_type, chart_reference)
SELECT id, node_id, topology_id, name, chart, version, namespace, "values", status, release_name, created_at, updated_at, node_selector, chart_type, chart_reference
FROM applications;

-- Drop old table and rename new one
DROP TABLE applications;
ALTER TABLE applications_temp RENAME TO applications;

-- Recreate indexes
DROP INDEX IF EXISTS idx_applications_topology;
DROP INDEX IF EXISTS idx_applications_status;
DROP INDEX IF EXISTS idx_applications_topology_node_selector;
DROP INDEX IF EXISTS idx_applications_chart_type;
CREATE INDEX idx_applications_topology ON applications(topology_id);
CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_applications_topology_node_selector ON applications(topology_id, node_selector);
CREATE INDEX idx_applications_chart_type ON applications(chart_type);