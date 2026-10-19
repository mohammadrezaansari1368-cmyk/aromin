-- 006 — identity map (WP-A) + server attendance (WP-B). Idempotent. Down: 006_identity_attendance.down.sql.txt
CREATE TABLE IF NOT EXISTS identity_aliases (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 tenant VARCHAR(64) NOT NULL,
 kind VARCHAR(10) NOT NULL,            -- card | julio | ext | name
 alias_key VARCHAR(191) NOT NULL,      -- card/julio/ext: ASCII digits, no leading zeros. name: normalize_name()
 raw_value VARCHAR(255) NOT NULL,      -- as seen (display only)
 source VARCHAR(20) NOT NULL,          -- attendance | tasks | calllog | callsummary | manual | migration
 person_id VARCHAR(64),                -- str(people[].id). NULL = unmatched
 status VARCHAR(10) NOT NULL,          -- confirmed | suggested | review | rejected
 confidence VARCHAR(10) NOT NULL,      -- exact | strong | weak | ambiguous | none | manual
 candidates TEXT,                      -- JSON [{personId, confidence, reasons}], max 5
 decided_by VARCHAR(100), decided_at DATETIME,
 created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
 UNIQUE KEY identity_alias (tenant, kind, alias_key), KEY identity_person (tenant, person_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS attendance_batches (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 tenant VARCHAR(64) NOT NULL,
 file_sha256 CHAR(64) NOT NULL,        -- sha256 of the raw file bytes (migration: of canonical JSON)
 file_name VARCHAR(255) NOT NULL,
 source VARCHAR(20) NOT NULL,          -- import-center | card | migration
 uploaded_by VARCHAR(100) NOT NULL,
 period_from CHAR(10), period_to CHAR(10),
 sheets INT NOT NULL, days INT NOT NULL,
 inserted INT NOT NULL, updated INT NOT NULL, unchanged INT NOT NULL,
 skipped TEXT,                         -- JSON [{sheet, reason}]
 created_at DATETIME NOT NULL,
 UNIQUE KEY attendance_batch_file (tenant, file_sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS attendance_days (
 tenant VARCHAR(64) NOT NULL,
 card_no VARCHAR(32) NOT NULL,
 date_j CHAR(10) NOT NULL,             -- YYYY/MM/DD Jalali, zero-padded
 sheet_name VARCHAR(100) NOT NULL,
 person_name VARCHAR(200),             -- first+last from the row, display only
 punches TEXT NOT NULL,                -- JSON minutes [in1,out1,...] max 6
 present_min INT,                      -- device total, else computed from even punches, else NULL
 note TEXT,
 raw_json TEXT NOT NULL,               -- original row (processSheet input), canonical JSON
 row_sha256 CHAR(64) NOT NULL,         -- sha of raw_json, unchanged detection
 batch_id BIGINT NOT NULL,
 updated_at DATETIME NOT NULL,
 PRIMARY KEY (tenant, card_no, date_j), KEY attendance_day_batch (tenant, batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS attendance_overrides (
 tenant VARCHAR(64) NOT NULL,
 card_no VARCHAR(32) NOT NULL,
 date_j CHAR(10) NOT NULL,
 fields TEXT NOT NULL,                 -- JSON RowEdit, validated whitelist
 updated_by VARCHAR(100) NOT NULL,
 updated_at DATETIME NOT NULL,
 PRIMARY KEY (tenant, card_no, date_j)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS attendance_settings (
 tenant VARCHAR(64) PRIMARY KEY,
 settings TEXT NOT NULL,               -- JSON Settings (validated)
 updated_by VARCHAR(100), updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
