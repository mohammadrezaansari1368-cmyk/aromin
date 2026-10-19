-- 010: Harikan 7 day/month attendance exports received through the dashboard MCP server (tool save_attendance_export).
-- One row per (tenant, kind, key); the same export again is "unchanged", a newer one replaces it (upsert).
CREATE TABLE IF NOT EXISTS harikan_exports (
 tenant VARCHAR(64) NOT NULL,
 kind VARCHAR(5) NOT NULL,             -- day | month
 export_key CHAR(10) NOT NULL,         -- day: YYYY/MM/DD, month: YYYY/MM (Jalali)
 payload MEDIUMTEXT NOT NULL,          -- the HKE object as received (canonical JSON)
 payload_sha256 CHAR(64) NOT NULL,
 people INT NOT NULL,                  -- month: people[] length; day: distinct codes
 received_at DATETIME NOT NULL,
 updated_at DATETIME NOT NULL,
 PRIMARY KEY (tenant, kind, export_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
