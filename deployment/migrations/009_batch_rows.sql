-- 009: batch membership + per-domain writer lock (R01). Deleting a batch must not lose rows that other batches still contain.
-- import_batch_rows: every valid row of every upload, with that file's own content (never the stored row).
-- import_locks: one row per (tenant, domain); every upload / batch delete / all-delete locks it first, so writers never interleave.
CREATE TABLE IF NOT EXISTS import_batch_rows (
 tenant VARCHAR(64) NOT NULL,
 domain VARCHAR(12) NOT NULL,          -- attendance | calllog | calls | ticket
 batch_id BIGINT NOT NULL,             -- id in attendance_batches / call_batches / ticket_batches
 row_key VARCHAR(191) NOT NULL,        -- attendance card|date, calllog channel_code, calls from|to|direction|ext, ticket ticket_no
 row_sha256 CHAR(64) NOT NULL,
 sort_key VARCHAR(32),                 -- calllog: sync_at; attendance: 'migration' for browser-migration batches; else NULL
 payload MEDIUMTEXT NOT NULL,          -- canonical JSON of the data-table columns this file would write
 PRIMARY KEY (tenant, domain, batch_id, row_key), KEY import_batch_row_key (tenant, domain, row_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS import_locks (
 tenant VARCHAR(64) NOT NULL,
 domain VARCHAR(12) NOT NULL,          -- attendance | calls (calllog + calls share call_batches) | tickets
 PRIMARY KEY (tenant, domain)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
