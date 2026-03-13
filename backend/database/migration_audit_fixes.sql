-- 1. Prevent duplicate rent/late fee invoices for the same lease/period
-- We include description in the key to allow different types of invoices (e.g. Rent vs specific Fee) in same month.
ALTER TABLE rent_invoices ADD UNIQUE KEY unique_periodic_invoice (lease_id, year, month, invoice_type, description);

-- 2. Add Unique constraint to property visits to prevent double booking unit/time
ALTER TABLE property_visits ADD UNIQUE KEY unique_unit_visit (unit_id, scheduled_date);

-- 3. Prevent duplicate maintenance requests with same title for same unit
-- (We use the status in the key to allow re-submission if previous one is completed)
ALTER TABLE maintenance_requests ADD UNIQUE KEY unique_request_spam (unit_id, tenant_id, title, status);

-- 5. Prevent duplicate payouts for the same owner/period
ALTER TABLE owner_payouts ADD UNIQUE KEY unique_owner_payout_period (owner_id, period_start, period_end);

-- 6. Prevent duplicate payment records with same reference number
ALTER TABLE payments ADD UNIQUE KEY unique_payment_ref (reference_number);

-- 10. Prevent duplicate images for the same entity
ALTER TABLE property_images ADD UNIQUE KEY unique_property_image (property_id, image_url(255));
ALTER TABLE unit_images ADD UNIQUE KEY unique_unit_image (unit_id, image_url(255));
ALTER TABLE maintenance_images ADD UNIQUE KEY unique_request_image (request_id, image_url(255));

-- 11. Prevent duplicate maintenance cost records
ALTER TABLE maintenance_costs ADD UNIQUE KEY unique_cost_entry (request_id, description(255), amount, recorded_date);
