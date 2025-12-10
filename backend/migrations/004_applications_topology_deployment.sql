-- Migration: Update applications table for topology-based deployment
-- Changes applications from node-specific to topology-wide with node selectors

-- Add new columns
ALTER TABLE applications ADD COLUMN node_selector TEXT;  -- JSON array of node IDs
ALTER TABLE applications ADD COLUMN chart_type TEXT DEFAULT 'predefined';  -- 'predefined' or 'custom'
ALTER TABLE applications ADD COLUMN chart_reference TEXT;  -- Full chart reference (repo/chart or just name)

-- Migrate existing data: convert node_id to node_selector array
UPDATE applications SET
    node_selector = json_array(node_id),
    chart_reference = chart,
    chart_type = 'predefined'
WHERE node_selector IS NULL;

-- Make node_id nullable for backward compatibility (existing records keep it, new ones don't use it)
-- Note: We can't drop the column in SQLite without recreating the table
-- So we make it nullable to allow new topology-wide deployments
CREATE TABLE applications_temp (
    id TEXT PRIMARY KEY NOT NULL,
    node_id TEXT,  -- Made nullable
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
