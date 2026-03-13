-- migration_payout_capture.sql
-- Fixes payout logic by linking financial records to specific payouts

USE pms_database;

-- Add payout_id to payments
ALTER TABLE payments 
ADD COLUMN payout_id INT NULL,
ADD CONSTRAINT fk_payment_payout 
FOREIGN KEY (payout_id) REFERENCES owner_payouts(payout_id) 
ON DELETE SET NULL;

-- Add payout_id to maintenance_costs
ALTER TABLE maintenance_costs 
ADD COLUMN payout_id INT NULL,
ADD CONSTRAINT fk_maintenance_payout 
FOREIGN KEY (payout_id) REFERENCES owner_payouts(payout_id) 
ON DELETE SET NULL;

-- Index for performance on un-linked records
CREATE INDEX idx_payments_payout_id ON payments(payout_id);
CREATE INDEX idx_maintenance_costs_payout_id ON maintenance_costs(payout_id);
