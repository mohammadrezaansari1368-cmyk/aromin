CREATE TABLE IF NOT EXISTS pub_settings (
 tenant VARCHAR(100) PRIMARY KEY, settings LONGTEXT NOT NULL,
 updated_by VARCHAR(100), updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS pub_jobs (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant VARCHAR(100) NOT NULL,
 schedule_key VARCHAR(40) NOT NULL, local_date DATE NOT NULL,
 generation INT NOT NULL DEFAULT 1, status VARCHAR(30) NOT NULL,
 product_url TEXT, product_json LONGTEXT, copy_json LONGTEXT, settings_json LONGTEXT NOT NULL,
 ai_calls INT NOT NULL DEFAULT 0, ai_state VARCHAR(10) NOT NULL DEFAULT 'NONE',
 snapshot_sha256 CHAR(64), source_fingerprint CHAR(64), revalidated_at DATETIME,
 channel_asset CHAR(64), story_asset CHAR(64), visual_mode VARCHAR(50),
 approval_mode VARCHAR(20) NOT NULL, approved_by VARCHAR(100), approved_at DATETIME,
 approved_snapshot CHAR(64), publish_at_utc DATETIME NOT NULL,
 lease_until DATETIME, lease_token CHAR(32), preview_state VARCHAR(20), preview_message_id BIGINT,
 report_sha256 CHAR(64), last_error TEXT, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
 UNIQUE KEY pub_day (tenant, schedule_key, local_date), KEY pub_work (status, publish_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS pub_slots (
 tenant VARCHAR(100) NOT NULL, schedule_key VARCHAR(40) NOT NULL,
 slot_date DATE NOT NULL, job_id BIGINT, reserved_at DATETIME NOT NULL,
 PRIMARY KEY (tenant, schedule_key, slot_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS pub_deliveries (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, job_id BIGINT NOT NULL,
 generation INT NOT NULL, snapshot_sha256 CHAR(64) NOT NULL, snapshot_json LONGTEXT,
 destination VARCHAR(30) NOT NULL, status VARCHAR(20) NOT NULL,
 attempts INT NOT NULL DEFAULT 0, next_at DATETIME, inflight TINYINT NOT NULL DEFAULT 0,
 lease_until DATETIME, remote_id VARCHAR(200), remote_state LONGTEXT,
 remote_url TEXT, last_error TEXT, sent_at DATETIME,
 UNIQUE KEY pub_destination (job_id, generation, destination)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS pub_assets (
 sha256 CHAR(64) PRIMARY KEY, kind VARCHAR(20) NOT NULL, mime VARCHAR(40) NOT NULL,
 width INT NOT NULL, height INT NOT NULL, path TEXT NOT NULL, created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS pub_audit (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, job_id BIGINT, delivery_id BIGINT,
 actor VARCHAR(100), action VARCHAR(40) NOT NULL, detail TEXT, at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
