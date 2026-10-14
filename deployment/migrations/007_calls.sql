-- 007 — calls on the server (WP-C). Idempotent. Down: 007_calls.down.sql.txt
CREATE TABLE IF NOT EXISTS call_batches (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 tenant VARCHAR(64) NOT NULL,
 kind VARCHAR(10) NOT NULL,            -- calllog | calls
 file_sha256 CHAR(64) NOT NULL,        -- sha256 of the raw file bytes
 file_name VARCHAR(255) NOT NULL,
 source VARCHAR(20) NOT NULL,          -- import-center
 uploaded_by VARCHAR(100) NOT NULL,
 direction VARCHAR(3),                 -- calls only: in | out (user-chosen)
 period_from CHAR(10), period_to CHAR(10),   -- calllog: min/max date_j; calls: user-chosen
 rows_total INT NOT NULL, inserted INT NOT NULL, updated INT NOT NULL, unchanged INT NOT NULL, conflicts INT NOT NULL,
 skipped TEXT,                         -- JSON [{row, reason}] max 200
 details TEXT,                         -- JSON {conflicts:[{key, reason, fields}], updates:[{key, reason, fields}]} max 200 each
 created_at DATETIME NOT NULL,
 UNIQUE KEY call_batch_file (tenant, file_sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS call_logs (
 tenant VARCHAR(64) NOT NULL,
 channel_code VARCHAR(32) NOT NULL,    -- «کد کانال», ASCII digits
 date_j CHAR(10) NOT NULL,             -- «تاریخ کانال» YYYY/MM/DD
 time_s INT,                           -- «ساعت» seconds since midnight; NULL if unparsable
 direction VARCHAR(8) NOT NULL,        -- in | out | internal | unknown
 o_ext VARCHAR(8), o_julio VARCHAR(32), o_phone VARCHAR(32), o_contact VARCHAR(32), o_name VARCHAR(200),
 d_ext VARCHAR(8), d_julio VARCHAR(32), d_phone VARCHAR(32), d_contact VARCHAR(32), d_name VARCHAR(200),
 total_sec INT, talk_sec INT,
 channel_status VARCHAR(12) NOT NULL,  -- success | no_answer | busy | failed | other
 call_status VARCHAR(12) NOT NULL,     -- answered | missed | other
 sync_at CHAR(16),                     -- «تاریخ همگام‌سازی» → 'YYYY/MM/DD HH:MM'
 raw_json TEXT NOT NULL,               -- original row, canonical JSON
 row_sha256 CHAR(64) NOT NULL,         -- sha(raw_json)
 core_sha256 CHAR(64) NOT NULL,        -- sha(canonical(core fields))
 batch_id BIGINT NOT NULL,
 updated_at DATETIME NOT NULL,
 PRIMARY KEY (tenant, channel_code), KEY call_log_date (tenant, date_j), KEY call_log_batch (tenant, batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS call_summaries (
 tenant VARCHAR(64) NOT NULL,
 period_from CHAR(10) NOT NULL, period_to CHAR(10) NOT NULL,
 direction VARCHAR(3) NOT NULL,        -- in | out
 ext VARCHAR(8) NOT NULL,              -- «داخلی»
 agent_name VARCHAR(200),              -- «کارشناس», display only
 total INT NOT NULL, answered INT NOT NULL, no_answer INT NOT NULL, busy INT NOT NULL, failed INT NOT NULL,
 talk_sec INT NOT NULL,
 raw_json TEXT NOT NULL, row_sha256 CHAR(64) NOT NULL,
 batch_id BIGINT NOT NULL, updated_at DATETIME NOT NULL,
 PRIMARY KEY (tenant, period_from, period_to, direction, ext), KEY call_summary_batch (tenant, batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
