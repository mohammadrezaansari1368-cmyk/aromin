-- Add collection status; retain all historical values without rewriting invoices.
ALTER TABLE deals MODIFY COLUMN settle ENUM('cash','check','hold','cash_after_check') NOT NULL DEFAULT 'cash';
