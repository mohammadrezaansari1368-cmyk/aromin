-- 012: tokens set from Settings (write-once, then locked) — encrypted at rest with AROMIN_SECRETS_KEY; audit of every change.
-- New tables only; no existing table changes. The same DDL is applied lazily by server.secret_tables().
CREATE TABLE IF NOT EXISTS app_secrets (
 name VARCHAR(40) NOT NULL PRIMARY KEY,   -- bale_leads | telegram_leads | update_token
 ciphertext TEXT NOT NULL,                -- "v1." + base64(nonce|ct|tag); never the plaintext
 last4 VARCHAR(8) NOT NULL,
 set_at DATETIME NOT NULL,
 set_by VARCHAR(120) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS secret_audit (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(40) NOT NULL,
 action VARCHAR(12) NOT NULL,             -- set | replace | clear | rotate
 actor VARCHAR(120) NULL,
 last4 VARCHAR(8) NULL,
 ip VARCHAR(64) NULL,
 at DATETIME NOT NULL,
 KEY ix_secret_audit (name, at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
