-- =====================================================================
--  مهاجرت ۰۰۱ — اسکیمای پایه (idempotent: با IF NOT EXISTS)
--  این فایل به‌صورت خودکار توسط migrate.js اجرا می‌شود.
--  (ساختِ دیتابیس و USE را خودِ runner انجام می‌دهد.)
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64)  NOT NULL UNIQUE,
  pass_hash     VARCHAR(255) NOT NULL,
  role          ENUM('manager','finance','sales','support') NOT NULL DEFAULT 'sales',
  can_edit      TINYINT(1)   NOT NULL DEFAULT 1,
  person_id     INT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS role_access (
  role   ENUM('manager','finance','sales','support') NOT NULL,
  panel  VARCHAR(32) NOT NULL,
  PRIMARY KEY (role, panel)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS people (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(128) NOT NULL,
  role        ENUM('sales','support','finance') NOT NULL DEFAULT 'sales',
  level       ENUM('senior','mid','junior')     NOT NULL DEFAULT 'junior',
  comp_model  ENUM('hybrid','commission','fixed') NOT NULL DEFAULT 'hybrid',
  settings    JSON NULL,
  perf        JSON NULL,
  spif        JSON NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_people_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS deals (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  person_id     INT NOT NULL,
  deal_no       VARCHAR(64)  NULL,
  customer      VARCHAR(255) NULL,
  jmonth        TINYINT      NOT NULL DEFAULT 3,
  jyear         SMALLINT     NOT NULL DEFAULT 1405,
  amount        DECIMAL(18,0) NOT NULL DEFAULT 0,
  funnel        ENUM('start','qualify','advance','won','lost') NOT NULL DEFAULT 'won',
  stages        JSON NULL,
  close_role    VARCHAR(32)  NULL,
  mgr_share     TINYINT(1)   NOT NULL DEFAULT 0,
  settle        ENUM('cash','check','hold') NOT NULL DEFAULT 'cash',
  kind          ENUM('new','repeat')        NOT NULL DEFAULT 'new',
  channel       ENUM('official','unofficial') NOT NULL DEFAULT 'official',
  lead_gen      VARCHAR(128) NULL,
  support_gen   VARCHAR(128) NULL,
  support_sla   TINYINT(1)   NOT NULL DEFAULT 0,
  fin_by        VARCHAR(128) NULL,
  lead_src      VARCHAR(128) NULL,
  loss_reason   VARCHAR(255) NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_deals_person FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
  KEY idx_deals_month (jyear, jmonth),
  KEY idx_deals_person_month (person_id, jyear, jmonth),
  KEY idx_deals_funnel (funnel),
  UNIQUE KEY uq_deal (person_id, deal_no, jyear, jmonth)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tickets (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  ticket_no    VARCHAR(64)  NULL,
  company      VARCHAR(255) NULL,
  subject      VARCHAR(128) NULL,
  agent        VARCHAR(128) NULL,
  sla_ok       TINYINT(1)   NOT NULL DEFAULT 1,
  ola_ok       TINYINT(1)   NOT NULL DEFAULT 1,
  deal_id      BIGINT NULL,
  jyear        SMALLINT NOT NULL DEFAULT 1405,
  jmonth       TINYINT  NOT NULL DEFAULT 3,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tickets_deal FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL,
  KEY idx_tickets_agent (agent),
  KEY idx_tickets_month (jyear, jmonth)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_settings (
  skey       VARCHAR(64) PRIMARY KEY,
  sval       JSON NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS month_targets (
  jyear   SMALLINT NOT NULL,
  jmonth  TINYINT  NOT NULL,
  target_million DECIMAL(12,0) NOT NULL DEFAULT 0,
  PRIMARY KEY (jyear, jmonth)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS snapshots (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  label      VARCHAR(128) NULL,
  payload    LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT IGNORE INTO role_access (role, panel) VALUES
 ('manager','p-inv'),('manager','p-dash'),('manager','p-own'),('manager','p-month'),
 ('manager','p-team'),('manager','p-sim'),('manager','p-kpi'),('manager','p-track'),
 ('manager','p-ticket'),('manager','p-perfteam'),('manager','p-set'),('manager','p-report'),('manager','p-forecast'),
 ('finance','p-inv'),('finance','p-dash'),('finance','p-own'),('finance','p-month'),
 ('finance','p-team'),('finance','p-sim'),('finance','p-kpi'),('finance','p-track'),
 ('finance','p-ticket'),('finance','p-perfteam'),('finance','p-set'),('finance','p-report'),('finance','p-forecast'),
 ('sales','p-team'),('sales','p-kpi'),('sales','p-track'),('sales','p-ticket'),('sales','p-perfteam'),
 ('support','p-team'),('support','p-kpi'),('support','p-track'),('support','p-ticket'),('support','p-perfteam');

INSERT IGNORE INTO users (username, pass_hash, role, can_edit)
VALUES ('مدیر', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'manager', 1);
