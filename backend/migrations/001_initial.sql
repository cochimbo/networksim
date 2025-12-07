-- Topologies table
CREATE TABLE IF NOT EXISTS topologies (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    data TEXT NOT NULL,  -- JSON with nodes and links
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Deployments table
CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY NOT NULL,
    topology_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    k8s_resources TEXT,  -- JSON with K8s resource references
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (topology_id) REFERENCES topologies(id) ON DELETE CASCADE
);

-- Chaos conditions table
CREATE TABLE IF NOT EXISTS chaos_conditions (
    id TEXT PRIMARY KEY NOT NULL,
    deployment_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    condition_type TEXT NOT NULL,
    params TEXT NOT NULL,  -- JSON params
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE
);

-- Applications (Helm releases) table
CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY NOT NULL,
    deployment_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    chart_repo TEXT,
    chart_name TEXT NOT NULL,
    chart_version TEXT,
    values TEXT,  -- JSON values
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE
);

-- Scenarios table
CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    topology_id TEXT,
    events TEXT NOT NULL,  -- YAML/JSON events
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (topology_id) REFERENCES topologies(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deployments_topology ON deployments(topology_id);
CREATE INDEX IF NOT EXISTS idx_chaos_deployment ON chaos_conditions(deployment_id);
CREATE INDEX IF NOT EXISTS idx_applications_deployment ON applications(deployment_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_topology ON scenarios(topology_id);
