-- 011: AROMIN Agent (P0) — settings per tenant, privacy-safe telemetry, consented PII-redacted fine-tune samples, lead score columns.
-- Idempotent; server.py agent_tables() applies the same DDL lazily (sa_leads itself is created at sales-agent activation).
CREATE TABLE IF NOT EXISTS agent_settings (
 tenant VARCHAR(64) NOT NULL PRIMARY KEY,
 data MEDIUMTEXT NOT NULL,
 updated_by VARCHAR(120) NULL,
 updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS agent_events (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 tenant VARCHAR(64) NOT NULL,
 site_id VARCHAR(40) NULL,
 event VARCHAR(32) NOT NULL,
 props VARCHAR(400) NULL,
 created_at DATETIME NOT NULL,
 KEY ix_agent_events (tenant, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS agent_training (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 tenant VARCHAR(64) NOT NULL,
 conversation_id VARCHAR(40) NOT NULL,
 messages MEDIUMTEXT NOT NULL,
 approved TINYINT NOT NULL DEFAULT 0,
 created_at DATETIME NOT NULL,
 updated_at DATETIME NOT NULL,
 UNIQUE KEY uq_agent_training (tenant, conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE IF EXISTS sa_leads ADD COLUMN IF NOT EXISTS lead_score INT NULL;
ALTER TABLE IF EXISTS sa_leads ADD COLUMN IF NOT EXISTS intent VARCHAR(12) NULL;
ALTER TABLE IF EXISTS sa_leads ADD COLUMN IF NOT EXISTS need VARCHAR(300) NULL;
ALTER TABLE IF EXISTS sa_leads ADD COLUMN IF NOT EXISTS consent TINYINT NOT NULL DEFAULT 0;
