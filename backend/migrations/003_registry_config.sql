-- Registry configuration for private container registries
CREATE TABLE IF NOT EXISTS registry_configs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    username TEXT,
    password TEXT,
    is_default INTEGER DEFAULT 0,
    is_insecure INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_registry_default ON registry_configs(is_default);

-- Insert Docker Hub as default registry
INSERT OR IGNORE INTO registry_configs (id, name, url, username, password, is_default, is_insecure, created_at, updated_at)
VALUES ('docker-hub', 'Docker Hub', 'docker.io', NULL, NULL, 1, 0, datetime('now'), datetime('now'));
