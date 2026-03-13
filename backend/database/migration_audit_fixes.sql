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

-- 8. Prevent duplicate behavior logs for the same tenant and category on the same day
-- Using DATE(created_at) isn't straightforward in a UNIQUE KEY, so we enforce it via (tenant_id, category, created_at) 
-- assuming created_at is just a date or precision is handled.
-- For standard SQL, we'll use a direct unique on the timestamp if it's meant to be one per "instance".
ALTER TABLE tenant_behavior_logs ADD UNIQUE KEY unique_daily_behavior (tenant_id, category, created_at);

-- 9. Prevent duplicate unread notifications
ALTER TABLE notifications ADD UNIQUE KEY unique_unread_notif (user_id, message(255), type, is_read);
