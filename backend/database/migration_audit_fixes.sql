-- 1. Prevent duplicate rent/late fee invoices for the same lease/period
-- We include description in the key to allow different types of invoices (e.g. Rent vs specific Fee) in same month.
ALTER TABLE rent_invoices ADD UNIQUE KEY unique_periodic_invoice (lease_id, year, month, invoice_type, description);

-- 2. Add Unique constraint to property visits to prevent double booking unit/time
-- Assuming visits have a scheduled_date
ALTER TABLE property_visits ADD UNIQUE KEY unique_unit_visit (unit_id, scheduled_date);
