-- 008 — support tickets on the server (WP-4). Idempotent. Down: 008_tickets.down.sql.txt
CREATE TABLE IF NOT EXISTS ticket_batches (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 tenant VARCHAR(64) NOT NULL,
 file_sha256 CHAR(64) NOT NULL,        -- sha256 of the raw file bytes
 file_name VARCHAR(255) NOT NULL,
 source VARCHAR(20) NOT NULL,          -- import-center
 uploaded_by VARCHAR(100) NOT NULL,
 period_from CHAR(10), period_to CHAR(10),   -- min/max date_j
 rows_total INT NOT NULL, inserted INT NOT NULL, updated INT NOT NULL, unchanged INT NOT NULL, conflicts INT NOT NULL,
 skipped TEXT,                         -- JSON [{row, reason}] max 200
 details TEXT,                         -- JSON {conflicts:[{key, reason, rows}], updates:[{key, fields}]} max 200 each
 created_at DATETIME NOT NULL,
 UNIQUE KEY ticket_batch_file (tenant, file_sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ticket_logs (
 tenant VARCHAR(64) NOT NULL,
 ticket_no VARCHAR(32) NOT NULL,       -- ticket number, ASCII digits
 date_j CHAR(10) NOT NULL,             -- registration date YYYY/MM/DD (owner decision: activity by registration date)
 agent_name VARCHAR(200),              -- «کارشناس» as seen (display only)
 agent_key VARCHAR(191),               -- identity name key (kind=name); NULL if empty
 channel VARCHAR(20), subject VARCHAR(100), status VARCHAR(60), company VARCHAR(255),
 sla_ok TINYINT, ola_ok TINYINT,       -- 1 on time («عدم تاخیر»), 0 late, NULL unknown/empty
 raw_json TEXT NOT NULL,               -- original row, canonical JSON
 row_sha256 CHAR(64) NOT NULL,
 batch_id BIGINT NOT NULL,
 updated_at DATETIME NOT NULL,
 PRIMARY KEY (tenant, ticket_no), KEY ticket_log_date (tenant, date_j), KEY ticket_log_batch (tenant, batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
