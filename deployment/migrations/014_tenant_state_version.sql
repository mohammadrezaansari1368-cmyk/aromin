-- 014: optimistic concurrency version counter on tenant_state (WP-04). POST /api/state and every
-- other server-side writer of tenant_state.payload bump this so stale clients get 409 instead of
-- silently overwriting each other. CREATE covers a fresh DB (migrations run before ensure_tenant_table);
-- ALTER covers a DB where tenant_state already exists without the column.
CREATE TABLE IF NOT EXISTS tenant_state (
 tenant   VARCHAR(64) PRIMARY KEY,
 industry VARCHAR(64),
 name     VARCHAR(255),
 payload  LONGTEXT,
 version  BIGINT UNSIGNED NOT NULL DEFAULT 0,
 updated  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE tenant_state ADD COLUMN IF NOT EXISTS version BIGINT UNSIGNED NOT NULL DEFAULT 0;
