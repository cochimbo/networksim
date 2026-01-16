CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY NOT NULL,
    topology_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    total_duration INTEGER NOT NULL DEFAULT 60,
    steps TEXT NOT NULL, -- JSON stored as TEXT
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (topology_id) REFERENCES topologies(id) ON DELETE CASCADE
);
