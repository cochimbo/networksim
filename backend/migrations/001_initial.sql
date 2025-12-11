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
    "values" TEXT,
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
