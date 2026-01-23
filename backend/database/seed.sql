-- =========================
-- PMS SEED DATA
-- =========================
USE pms_database2;

-- 1. USERS
-- Password hash: 'hashed_password_123' (Placeholder)
INSERT INTO users (user_id, name, email, password_hash, role, status) VALUES 
(1, 'Bavikaran', 'bavikaran01@gmail.com', '$2a$10$Q.cuGhAmIlkX8gPUeuNaHuTgd2m1t5V5gImZT2gpwmGUaOP0T/g2O', 'owner', 'active');

INSERT INTO users (user_id, name, email, password_hash, role, status) VALUES 
(2, 'Bob Tenant', 'tenant@pms.com', '$2a$10$X7.G.1/1/1/1/1/1/1/1/1', 'tenant', 'active'),
(3, 'Carol Smith', 'carol@email.com', '$2a$10$X7.G.1/1/1/1/1/1/1/1/1', 'tenant', 'active');

INSERT INTO users (user_id, name, email, password_hash, role, status) VALUES 
(4, 'John Doe', 'john.doe@pms.com', '$2a$10$X7.G.1/1/1/1/1/1/1/1/1', 'treasurer', 'active'),
(5, 'Jane Smith', 'jane.smith@pms.com', '$2a$10$X7.G.1/1/1/1/1/1/1/1/1', 'treasurer', 'active');

-- Tenant Profiles (Phones)
INSERT INTO tenant_profile (tenant_id, phone) VALUES 
(2, '+1-555-0102'),
(3, '+1-555-0103');

-- 2. PROPERTY TYPES
INSERT INTO property_types (type_id, name, description) VALUES 
(1, 'Apartment Building', 'Multi-unit residential building'),
(2, 'Commercial Building', 'Office or retail space'),
(3, 'Single Family Home', 'Standalone residential house'),
(4, 'Condo', 'Individually owned unit in a building'),
(5, 'Townhouse', 'Multi-floor home sharing walls');

-- 2.5 UNIT TYPES
INSERT INTO unit_types (type_id, name, description) VALUES 
(1, 'Studio', 'Single room with kitchenette'),
(2, '1 Bedroom', 'One bedroom unit'),
(3, '2 Bedroom', 'Two bedroom unit'),
(4, '3 Bedroom', 'Three bedroom unit'),
(5, 'Penthouse', 'Luxury top-floor unit'),
(6, 'Loft', 'Open-plan industrial-style unit');

-- 3. PROPERTIES
INSERT INTO properties (property_id, owner_id, name, property_type_id, address_line_1, address_line_2, address_line_3, image_url) VALUES 
(1, 1, 'Sunset Apartments', 1, '123 Main Street', 'Downtown', NULL, '/images/prop1.jpg'),
(2, 1, 'Commercial Plaza', 2, '456 Business Ave', 'City Center', 'Suite 100', '/images/prop2.jpg');

-- 4. UNITS
INSERT INTO units (unit_id, property_id, unit_number, unit_type_id, monthly_rent, status) VALUES 
(1, 1, 'A101', 1, 1200.00, 'occupied'),  -- Studio
(2, 1, 'A102', 2, 1500.00, 'available'), -- 1 Bedroom
(3, 1, 'A103', 3, 2000.00, 'occupied');  -- 2 Bedroom

-- 4. LEADS
INSERT INTO leads (lead_id, unit_id, name, email, phone, status, notes, score, last_contacted_at) VALUES 
(1, 2, 'Alice Johnson', 'alice@email.com', '+1-555-0101', 'interested', 'Interested in viewing next week', 75, '2025-01-05 10:00:00'),
(2, 2, 'David Martinez', 'david@email.com', '+1-555-0104', 'negotiation', 'Ready to sign lease', 90, '2026-01-10 14:00:00'),
(3, 3, 'Emma Wilson', 'emma@email.com', '+1-555-0105', 'dropped', 'Found another place', 10, '2025-01-08 16:00:00');

-- 5. LEASES
INSERT INTO leases (lease_id, tenant_id, unit_id, start_date, end_date, monthly_rent, status) VALUES 
(1, 2, 1, '2024-06-01', '2026-02-15', 1200.00, 'active'),
(2, 3, 3, '2024-07-01', '2026-01-25', 2000.00, 'active');

-- 6. RENT INVOICES
INSERT INTO rent_invoices (invoice_id, lease_id, tenant_id, unit_id, year, month, amount, due_date, status, created_at) VALUES 
(1, 1, 2, 1, 2026, 1, 1200.00, '2026-01-05', 'pending', '2025-12-28 10:00:00'),
(2, 2, 3, 3, 2026, 1, 2000.00, '2026-01-05', 'paid', '2025-12-28 10:00:00');

-- 7. PAYMENTS
INSERT INTO payments (payment_id, invoice_id, tenant_id, amount, payment_date, payment_method, reference_number, status, verified_by) VALUES 
(1, 2, 3, 2000.00, '2026-01-03', 'Bank Transfer', 'BT-2026-001', 'verified', 4);

-- 8. RECEIPTS
INSERT INTO receipts (receipt_id, payment_id, invoice_id, tenant_id, amount, receipt_date, receipt_number) VALUES 
(1, 1, 2, 3, 2000.00, '2026-01-04', 'REC-2026-001');


-- MAINTENANCE REQUESTS
INSERT INTO maintenance_requests (request_id, unit_id, tenant_id, title, description, priority, status, created_at) VALUES 
(1, 1, 2, 'Leaking faucet', 'Kitchen faucet is dripping continuously', 'medium', 'submitted', '2026-01-08 09:00:00');
