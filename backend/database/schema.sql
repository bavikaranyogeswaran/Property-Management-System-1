-- =========================
-- PMS DATABASE (FINAL - ADJUSTED)
-- =========================
DROP DATABASE IF EXISTS pms_database;
CREATE DATABASE pms_database;
USE pms_database;

-- =========================
-- USERS (AUTH + RBAC)
-- =========================
-- =========================
-- USERS (AUTH + RBAC)
-- =========================
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('owner','tenant','treasurer') NOT NULL,
    is_email_verified BOOLEAN DEFAULT FALSE,
    email_verified_at DATETIME,
    status ENUM('active','inactive','banned') DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- ROLE PROFILES (SRI LANKAN CONTEXT)
-- =========================

-- TENANTS
CREATE TABLE tenants (
    user_id INT PRIMARY KEY,
    nic VARCHAR(20) UNIQUE,              -- NIC (Optional, number format)
    nic_url VARCHAR(500),                -- [ADDED] URL to uploaded NIC document
    permanent_address VARCHAR(255),      -- Tenant's permanent address
    emergency_contact_name VARCHAR(100),
    emergency_contact_phone VARCHAR(20),
    employment_status ENUM('employed', 'self-employed', 'student', 'unemployed'),
    monthly_income DECIMAL(15,2),        -- LKR
    behavior_score INT DEFAULT 100,      -- [ADDED] Tenant scoring
    credit_balance DECIMAL(10, 2) DEFAULT 0.00, -- [ADDED] Overpayment balance
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE tenant_behavior_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    type ENUM('positive','negative','neutral') NOT NULL,
    category VARCHAR(50) NOT NULL,
    score_change INT NOT NULL,
    description TEXT,
    recorded_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(user_id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- OWNERS
CREATE TABLE owners (
    user_id INT PRIMARY KEY,
    nic VARCHAR(20),
    tin VARCHAR(50),                     -- Taxpayer Identification Number
    bank_name VARCHAR(100),
    branch_name VARCHAR(100),
    account_holder_name VARCHAR(100),
    account_number VARCHAR(50),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- STAFF (TREASURERS)
CREATE TABLE staff (
    user_id INT PRIMARY KEY,
    nic VARCHAR(20),
    employee_id VARCHAR(50) UNIQUE,
    job_title VARCHAR(50),
    shift_start TIME,
    shift_end TIME,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- =========================
-- PROPERTIES & UNITS
-- =========================
-- =========================
-- PROPERTY TYPES (3NF)
-- =========================
CREATE TABLE property_types (
    type_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255)
);

-- =========================
-- UNIT TYPES (3NF)
-- =========================
CREATE TABLE unit_types (
    type_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255)
);

-- =========================
-- PROPERTIES & UNITS
-- =========================
CREATE TABLE properties (
    property_id INT AUTO_INCREMENT PRIMARY KEY,
    owner_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    property_type_id INT NOT NULL,           -- [MODIFIED] FK to property_types
    property_no VARCHAR(50),             -- [ADDED] Property Number
    street VARCHAR(255) NOT NULL,        -- [ADDED] Street Name
    city VARCHAR(100) NOT NULL,          -- [ADDED] City
    district VARCHAR(100) NOT NULL,      -- [ADDED] District
    -- address_line_1/2/3 Removed
    status ENUM('active','inactive') DEFAULT 'active',
    image_url VARCHAR(255),                  -- [DEPRECATED] Use property_images table instead
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (property_type_id) REFERENCES property_types(type_id)
);

CREATE TABLE units (
    unit_id INT AUTO_INCREMENT PRIMARY KEY,
    property_id INT NOT NULL,
    unit_number VARCHAR(50) NOT NULL,
    unit_type_id INT NOT NULL,               -- [MODIFIED] FK to unit_types
    monthly_rent DECIMAL(10,2) NOT NULL,
    status ENUM('available','occupied','maintenance') DEFAULT 'available',
    image_url VARCHAR(255),                  -- [DEPRECATED] Use unit_images table instead
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (property_id, unit_number),
    FOREIGN KEY (property_id) REFERENCES properties(property_id) ON DELETE CASCADE,
    FOREIGN KEY (unit_type_id) REFERENCES unit_types(type_id)
);

-- =========================
-- PROPERTY & UNIT IMAGES
-- =========================
CREATE TABLE property_images (
    image_id INT AUTO_INCREMENT PRIMARY KEY,
    property_id INT NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    display_order INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(property_id) ON DELETE CASCADE
);

CREATE TABLE unit_images (
    image_id INT AUTO_INCREMENT PRIMARY KEY,
    unit_id INT NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    display_order INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE
);

-- =========================
-- LEADS & FOLLOW-UPS
-- =========================
CREATE TABLE leads (
    lead_id INT AUTO_INCREMENT PRIMARY KEY,
    property_id INT NOT NULL,                -- [ADDED] Link to property
    unit_id INT NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(100),
    status ENUM('interested','converted','dropped') DEFAULT 'interested',
    notes TEXT,
    internal_notes TEXT,                 -- [ADDED] Owner's private notes about this lead
    move_in_date DATE,                       -- [ADDED] Lead qualification
    occupants_count INT DEFAULT 1,           -- [ADDED] Lead qualification
    score INT DEFAULT 0,                     -- [ADDED] Lead scoring
    last_contacted_at DATETIME,              -- [ADDED] For follow-up tracking
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(property_id) ON DELETE CASCADE,
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE SET NULL,
    UNIQUE KEY unique_active_lead (property_id, email, status)
);

CREATE TABLE lead_followups (
    followup_id INT AUTO_INCREMENT PRIMARY KEY,
    lead_id INT NOT NULL,
    followup_date DATE NOT NULL,
    notes TEXT,
    FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE
);

CREATE TABLE lead_stage_history (
    history_id INT AUTO_INCREMENT PRIMARY KEY,
    lead_id INT NOT NULL,
    from_status ENUM('interested','converted','dropped') NULL,
    to_status   ENUM('interested','converted','dropped') NOT NULL,
    changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    duration_in_previous_stage INT,
        FOREIGN KEY (lead_id) REFERENCES leads(lead_id)
        ON DELETE CASCADE
);

CREATE TABLE messages (
    message_id INT AUTO_INCREMENT PRIMARY KEY,
    lead_id INT NOT NULL,
    sender_id INT NULL,                      -- Set when sender is a user (owner/tenant/treasurer)
    sender_lead_id INT NULL,                 -- Set when sender is a lead (guest)
    sender_type ENUM('user','lead') NOT NULL DEFAULT 'user',
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (sender_lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE
);

-- =========================
-- LEAD ACCESS TOKENS (Guest Portal)
-- =========================
CREATE TABLE lead_access_tokens (
    token_id INT AUTO_INCREMENT PRIMARY KEY,
    lead_id INT NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE
);

-- =========================
-- LEASES
-- =========================
CREATE TABLE leases (
    lease_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    unit_id INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    monthly_rent DECIMAL(10,2) NOT NULL,
    status ENUM('active','ended','cancelled') DEFAULT 'active',
    security_deposit DECIMAL(10, 2) DEFAULT 0.00,
    deposit_status ENUM('pending', 'paid', 'partially_refunded', 'refunded') DEFAULT 'pending',
    refunded_amount DECIMAL(10, 2) DEFAULT 0.00,
    document_url VARCHAR(500), -- [ADDED] Lease document URL
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE
);

-- =========================
-- RENT INVOICES
-- =========================
CREATE TABLE rent_invoices (
    invoice_id INT AUTO_INCREMENT PRIMARY KEY,
    lease_id INT NOT NULL,
    year SMALLINT NOT NULL,
    month TINYINT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    due_date DATE NOT NULL,
    status ENUM('pending','partially_paid','paid','overdue','void') DEFAULT 'pending',
    invoice_type ENUM('rent', 'maintenance', 'late_fee', 'deposit', 'other') DEFAULT 'rent',
    description VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lease_id) REFERENCES leases(lease_id) ON DELETE CASCADE,
    UNIQUE KEY unique_periodic_invoice (lease_id, year, month, invoice_type, description)
);

-- =========================
-- PAYMENTS
-- =========================
CREATE TABLE payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_date DATE NOT NULL,
    payment_method VARCHAR(30),
    proof_url VARCHAR(255),
    reference_number VARCHAR(100),
    status ENUM('pending','verified','rejected') DEFAULT 'pending',
    verified_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES rent_invoices(invoice_id) ON DELETE CASCADE,
    FOREIGN KEY (verified_by) REFERENCES users(user_id) ON DELETE SET NULL,
    UNIQUE KEY unique_payment_ref (reference_number)
);

-- =========================
-- RECEIPTS
-- =========================
CREATE TABLE receipts (
    receipt_id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT UNIQUE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    receipt_date DATE NOT NULL,
    receipt_number VARCHAR(50) UNIQUE NOT NULL,
    FOREIGN KEY (payment_id) REFERENCES payments(payment_id) ON DELETE CASCADE
);

-- =========================
-- MAINTENANCE REQUESTS
-- =========================
CREATE TABLE maintenance_requests (
    request_id INT AUTO_INCREMENT PRIMARY KEY,
    unit_id INT NOT NULL,
    tenant_id INT NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    priority ENUM('low','medium','high','urgent') DEFAULT 'medium',
    -- images JSON removed for normalization
    status ENUM('submitted','in_progress','completed') DEFAULT 'submitted',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE KEY unique_request_spam (unit_id, tenant_id, title, status)
);

CREATE TABLE maintenance_images (
    image_id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES maintenance_requests(request_id) ON DELETE CASCADE
);

CREATE TABLE maintenance_costs (
    cost_id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    description VARCHAR(255),
    amount DECIMAL(10,2) NOT NULL,
    recorded_date DATE NOT NULL,
    FOREIGN KEY (request_id) REFERENCES maintenance_requests(request_id) ON DELETE CASCADE
);

-- =========================
-- NOTIFICATIONS
-- =========================
CREATE TABLE notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    message TEXT NOT NULL,
    type ENUM('invoice','lease','maintenance','payment','visit','system') NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- =========================
-- OWNER PAYOUTS
-- =========================
CREATE TABLE owner_payouts (
    payout_id INT AUTO_INCREMENT PRIMARY KEY,
    owner_id INT NOT NULL,
    amount DECIMAL(15,2) NOT NULL, -- Net Amount
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status ENUM('pending', 'processed') DEFAULT 'pending',
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE KEY unique_owner_payout_period (owner_id, period_start, period_end)
);

-- =========================
-- SYSTEM AUDIT LOGS
-- =========================
CREATE TABLE system_audit_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT, -- Who performed the action (nullable for system)
    action_type VARCHAR(50) NOT NULL, -- e.g., 'LEASE_TERMINATION', 'PAYMENT_REJECTION'
    entity_id INT, -- ID of the affected entity (lease_id, invoice_id, etc.)
    details TEXT, -- JSON or text description of changes
    ip_address VARCHAR(45),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

-- =========================
-- PROPERTY VISITS
-- =========================
CREATE TABLE property_visits (
    visit_id INT AUTO_INCREMENT PRIMARY KEY,
    property_id INT NOT NULL,
    unit_id INT NULL,
    lead_id INT NULL,
    visitor_name VARCHAR(100) NOT NULL,
    visitor_email VARCHAR(100) NOT NULL,
    visitor_phone VARCHAR(20) NOT NULL,
    scheduled_date DATETIME NOT NULL,
    status ENUM('pending', 'confirmed', 'cancelled', 'completed') DEFAULT 'pending',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(property_id),
    FOREIGN KEY (unit_id) REFERENCES units(unit_id),
    FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE SET NULL,
    UNIQUE KEY unique_unit_visit (unit_id, scheduled_date)
);

-- =========================
-- STAFF ASSIGNMENTS
-- =========================
CREATE TABLE IF NOT EXISTS staff_property_assignments (
    assignment_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    property_id INT NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (property_id) REFERENCES properties(property_id) ON DELETE CASCADE,
    UNIQUE KEY unique_property (property_id)
);

-- =========================
-- ACCOUNTING LEDGER
-- =========================
CREATE TABLE accounting_ledger (
    entry_id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT,
    invoice_id INT,
    lease_id INT NOT NULL,
    account_type ENUM('revenue', 'liability', 'expense') NOT NULL,
    category VARCHAR(50) NOT NULL,
    debit DECIMAL(10,2) DEFAULT 0.00,
    credit DECIMAL(10,2) DEFAULT 0.00,
    description VARCHAR(255),
    entry_date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payment_id) REFERENCES payments(payment_id) ON DELETE SET NULL,
    FOREIGN KEY (invoice_id) REFERENCES rent_invoices(invoice_id) ON DELETE SET NULL,
    FOREIGN KEY (lease_id) REFERENCES leases(lease_id) ON DELETE CASCADE,
    UNIQUE KEY unique_ledger_payment (payment_id, account_type, category)
);

CREATE INDEX idx_ledger_lease ON accounting_ledger(lease_id);
CREATE INDEX idx_ledger_account_type ON accounting_ledger(account_type);
CREATE INDEX idx_ledger_entry_date ON accounting_ledger(entry_date);

-- =========================
-- INDEXES
-- =========================
CREATE INDEX idx_unit_status ON units(status);
CREATE INDEX idx_lead_status ON leads(status);
CREATE INDEX idx_lead_last_contacted ON leads(last_contacted_at);
CREATE INDEX idx_lease_status ON leases(status);
CREATE INDEX idx_invoice_status ON rent_invoices(status);
CREATE INDEX idx_payment_status ON payments(status);
CREATE INDEX idx_maintenance_status ON maintenance_requests(status);
CREATE INDEX idx_properties_city_district ON properties(city, district);
CREATE INDEX idx_units_rent ON units(monthly_rent);
CREATE INDEX idx_leases_status_end_date ON leases(status, end_date);
CREATE INDEX idx_invoices_status_due_date ON rent_invoices(status, due_date);


