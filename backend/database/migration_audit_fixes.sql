-- 1. Prevent duplicate rent/late fee invoices for the same lease/period
-- We include description in the key to allow different types of invoices (e.g. Rent vs specific Fee) in same month.
ALTER TABLE rent_invoices ADD UNIQUE KEY unique_periodic_invoice (lease_id, year, month, invoice_type, description);

-- 2. Add Unique constraint to property visits to prevent double booking unit/time
ALTER TABLE property_visits ADD UNIQUE KEY unique_unit_visit (unit_id, scheduled_date);

-- 3. Prevent duplicate maintenance requests with same title for same unit
-- (We use the status in the key to allow re-submission if previous one is completed)
ALTER TABLE maintenance_requests ADD UNIQUE KEY unique_request_spam (unit_id, tenant_id, title, status);

-- 4. Prevent duplicate lead entries for the same unit/email
ALTER TABLE leads ADD UNIQUE KEY unique_active_lead (property_id, email, status);
