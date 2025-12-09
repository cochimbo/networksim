-- Migration: Update applications table for Helm integration
-- Updates the applications table to match the new Application model

-- Drop old table and recreate with new structure
DROP TABLE IF EXISTS applications;

CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY NOT NULL,
    node_id TEXT NOT NULL,
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
    FOREIGN KEY (topology_id) REFERENCES topologies(id) ON DELETE CASCADE
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_applications_topology ON applications(topology_id);
CREATE INDEX IF NOT EXISTS idx_applications_node ON applications(node_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);