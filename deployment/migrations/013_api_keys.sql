-- 013: «وب سرویس» — API keys for connecting tools (Harikan bridge, CRM, scripts) to the dashboard MCP endpoint.
-- New table only; no existing table changes. Keys are stored as SHA-256 hashes; the key itself is shown once at creation.
CREATE TABLE IF NOT EXISTS api_keys (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 tenant VARCHAR(64) NOT NULL,
 name VARCHAR(80) NOT NULL,
 prefix VARCHAR(16) NOT NULL,            -- first characters, for recognising a key in the list
 key_hash CHAR(64) NOT NULL,             -- sha256 of the full key
 scopes VARCHAR(200) NOT NULL,           -- comma list: attendance:write, attendance:read, agent:ask
 created_by VARCHAR(120) NULL,
 created_at DATETIME NOT NULL,
 last_used_at DATETIME NULL,
 revoked_at DATETIME NULL,
 revoked_by VARCHAR(120) NULL,
 UNIQUE KEY uq_api_key_hash (key_hash),
 KEY ix_api_keys_tenant (tenant)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
