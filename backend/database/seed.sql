-- =========================
-- PMS SEED DATA
-- =========================
USE pms_database;

-- 1. USERS
-- Password hash: 'hashed_password_123' (Placeholder)
INSERT INTO users (user_id, name, email, password_hash, role, status) VALUES 
(1, 'John Owner', 'owner@test.com', '$2a$10$X7.G.1/1/1/1/1/1/1/1/1', 'owner', 'active'),
(2, 'Bob Tenant', 'tenant@pms.com', '$2a$10$X7.G.1/1/1/1/1/1/1/1/1', 'tenant', 'active'),
(3, 'Carol Smith', 'carol@email.com', '$2a$10$X7.G.1/1/1/1/1/1/1/1/1', 'tenant', 'active'),
(4, 'John Doe', 'john.doe@pms.com', '$2a$10$X7.G.1/1/1/1/1/1/1/1/1', 'treasurer', 'active'),
(5, 'Jane Smith', 'jane.smith@pms.com', '$2a$10$X7.G.1/1/1/1/1/1/1/1/1', 'treasurer', 'active');

-- Tenant Profiles (Phones)
INSERT INTO tenant_profile (tenant_id, phone) VALUES 
(2, '+1-555-0102'),
(3, '+1-555-0103');

-- 2. PROPERTIES
INSERT INTO properties (property_id, owner_id, name, type, address, image_url) VALUES 
(1, 1, 'Sunset Apartments', 'Apartment Building', '123 Main Street, Downtown', '/images/prop1.jpg'),
(2, 1, 'Commercial Plaza', 'Commercial Building', '456 Business Ave, City Center', '/images/prop2.jpg');

-- 3. UNITS
INSERT INTO units (unit_id, property_id, unit_number, unit_type, monthly_rent, status) VALUES 
(1, 1, 'A101', 'Studio', 1200.00, 'occupied'),
(2, 1, 'A102', '1 Bedroom', 1500.00, 'available'),
(3, 1, 'A103', '2 Bedroom', 2000.00, 'occupied');

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

-- 9. MAINTENANCE REQUESTS
INSERT INTO maintenance_requests (request_id, unit_id, tenant_id, title, description, priority, status, submitted_date) VALUES 
(1, 1, 2, 'Leaking faucet', 'Kitchen faucet is dripping continuously', 'medium', 'submitted', '2026-01-08 09:00:00');
