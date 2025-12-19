-- Migration: Add presets for new chaos types (StressChaos, PodChaos, IOChaos, HTTPChaos)
-- These new chaos types provide more diverse testing scenarios beyond network chaos

-- Insert new presets for stress, pod, io, and http chaos types
INSERT OR IGNORE INTO chaos_presets (id, name, description, category, icon, chaos_type, direction, duration, params, is_builtin) VALUES
-- StressChaos presets (CPU stress)
('preset-stress-high', 'High CPU Load', 'Stress CPU at 80% load with 2 workers', 'stress', '💻', 'stress-cpu', 'to', '60s', '{"load": 80, "workers": 2}', 1),
('preset-stress-spike', 'CPU Spike', 'Maximum CPU stress - 100% load with 4 workers', 'stress', '🔥', 'stress-cpu', 'to', '30s', '{"load": 100, "workers": 4}', 1),
('preset-stress-light', 'Light CPU Load', 'Light CPU stress at 30% - background noise', 'stress', '⚡', 'stress-cpu', 'to', '120s', '{"load": 30, "workers": 1}', 1),

-- PodChaos presets (pod-kill)
('preset-pod-kill', 'Pod Restart', 'Kill pod immediately (gracePeriod=0)', 'pod', '💀', 'pod-kill', 'to', NULL, '{"grace_period": 0}', 1),
('preset-pod-graceful', 'Graceful Pod Kill', 'Kill pod with 30s grace period', 'pod', '☠️', 'pod-kill', 'to', NULL, '{"grace_period": 30}', 1),

-- IOChaos presets (I/O delay)
('preset-io-slow', 'Slow Disk', 'Add 100ms latency to disk operations', 'io', '💾', 'io-delay', 'to', '60s', '{"delay": "100ms", "percent": 100}', 1),
('preset-io-timeout', 'Disk Timeout', 'Extreme disk latency (5s) - simulate disk failure', 'io', '🔴', 'io-delay', 'to', '30s', '{"delay": "5s", "percent": 100}', 1),
('preset-io-intermittent', 'Intermittent I/O', '500ms delay on 50% of operations', 'io', '📁', 'io-delay', 'to', '60s', '{"delay": "500ms", "percent": 50}', 1),

-- HTTPChaos presets (HTTP abort)
('preset-http-500', 'API Failure (500)', 'Return HTTP 500 Internal Server Error', 'http', '🌐', 'http-abort', 'to', '60s', '{"code": 500}', 1),
('preset-http-429', 'Rate Limit (429)', 'Simulate rate limiting with HTTP 429', 'http', '🚦', 'http-abort', 'to', '60s', '{"code": 429}', 1),
('preset-http-503', 'Service Unavailable', 'Return HTTP 503 Service Unavailable', 'http', '🔌', 'http-abort', 'to', '60s', '{"code": 503}', 1),
('preset-http-timeout', 'Gateway Timeout', 'Return HTTP 504 Gateway Timeout', 'http', '⏰', 'http-abort', 'to', '60s', '{"code": 504}', 1);
