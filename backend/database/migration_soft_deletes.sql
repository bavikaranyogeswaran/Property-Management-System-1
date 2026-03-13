-- =============================================
-- MIGRATION: SOFT DELETES & DATA INTEGRITY
-- =============================================

USE pms_database;

-- 1. ADD deleted_at COLUMNS FOR SOFT DELETES
ALTER TABLE users ADD COLUMN deleted_at DATETIME DEFAULT NULL;
ALTER TABLE properties ADD COLUMN deleted_at DATETIME DEFAULT NULL;
ALTER TABLE units ADD COLUMN deleted_at DATETIME DEFAULT NULL;
ALTER TABLE leases ADD COLUMN deleted_at DATETIME DEFAULT NULL;

-- 2. UPDATE ENUMS TO SUPPORT 'inactive' OR 'cancelled'
ALTER TABLE units MODIFY COLUMN status ENUM('available','occupied','maintenance','inactive') DEFAULT 'available';
ALTER TABLE leases MODIFY COLUMN status ENUM('active','ended','cancelled','inactive') DEFAULT 'active';

-- 3. REFIX FINANCIAL TABLE CONSTRAINTS (REMOVE CASCADE)
-- We need to drop existing foreign keys and re-add them with RESTRICT

-- RENT INVOICES -> LEASES
ALTER TABLE rent_invoices DROP FOREIGN KEY rent_invoices_ibfk_1;
ALTER TABLE rent_invoices ADD CONSTRAINT fk_invoices_lease 
    FOREIGN KEY (lease_id) REFERENCES leases(lease_id) ON DELETE RESTRICT;

-- PAYMENTS -> INVOICES
ALTER TABLE payments DROP FOREIGN KEY payments_ibfk_1;
ALTER TABLE payments ADD CONSTRAINT fk_payments_invoice 
    FOREIGN KEY (invoice_id) REFERENCES rent_invoices(invoice_id) ON DELETE RESTRICT;

-- RECEIPTS -> PAYMENTS
ALTER TABLE receipts DROP FOREIGN KEY receipts_ibfk_1;
ALTER TABLE receipts ADD CONSTRAINT fk_receipts_payment 
    FOREIGN KEY (payment_id) REFERENCES payments(payment_id) ON DELETE RESTRICT;

-- MAINTENANCE REQUESTS -> UNITS
ALTER TABLE maintenance_requests DROP FOREIGN KEY maintenance_requests_ibfk_1;
ALTER TABLE maintenance_requests ADD CONSTRAINT fk_maintenance_unit 
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE RESTRICT;

-- MAINTENANCE REQUESTS -> TENANTS (USERS)
ALTER TABLE maintenance_requests DROP FOREIGN KEY maintenance_requests_ibfk_2;
ALTER TABLE maintenance_requests ADD CONSTRAINT fk_maintenance_tenant 
    FOREIGN KEY (tenant_id) REFERENCES users(user_id) ON DELETE RESTRICT;

-- ACCOUNTING LEDGER -> LEASES
ALTER TABLE accounting_ledger DROP FOREIGN KEY accounting_ledger_ibfk_3;
ALTER TABLE accounting_ledger ADD CONSTRAINT fk_ledger_lease 
    FOREIGN KEY (lease_id) REFERENCES leases(lease_id) ON DELETE RESTRICT;

-- 4. UPDATE INDEXES FOR SOFT DELETES
CREATE INDEX idx_users_deleted_at ON users(deleted_at);
CREATE INDEX idx_properties_deleted_at ON properties(deleted_at);
CREATE INDEX idx_units_deleted_at ON units(deleted_at);
CREATE INDEX idx_leases_deleted_at ON leases(deleted_at);
