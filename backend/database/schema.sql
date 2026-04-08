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
    token_version INT DEFAULT 0,
    status ENUM('active','inactive','banned') DEFAULT 'active',
    is_archived BOOLEAN DEFAULT FALSE,
    archived_at DATETIME,
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
    monthly_income BIGINT,        -- LKR in Cents
    behavior_score INT DEFAULT 100,      -- [ADDED] Tenant scoring
    credit_balance BIGINT DEFAULT 0, -- [ADDED] Overpayment balance in Cents
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
    FOREIGN KEY (recorded_by) REFERENCES users(user_id) ON DELETE SET NULL,
    UNIQUE KEY unique_daily_behavior (tenant_id, category, created_at)
);

-- OWNERS
CREATE TABLE owners (
    user_id INT PRIMARY KEY,
    nic VARCHAR(20) UNIQUE,
    tin VARCHAR(50),                     -- Taxpayer Identification Number
    tin_url VARCHAR(500),                -- [ADDED] URL to uploaded TIN document
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
    property_type_id INT NOT NULL,           -- FK to property_types
    property_no VARCHAR(50),
    street VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    district VARCHAR(100) NOT NULL,
    image_url VARCHAR(500),              -- [LEGACY] Kept for backward compat, source of truth is property_images
    description TEXT,
    features JSON,                       -- [LEGACY] Kept for backward compat, source of truth is property_amenities
    status ENUM('active','inactive') DEFAULT 'active',
    is_archived BOOLEAN DEFAULT FALSE,
    archived_at DATETIME,

    late_fee_percentage DECIMAL(5,2) DEFAULT 3.00,
    late_fee_type ENUM('flat_percentage', 'daily_fixed') DEFAULT 'flat_percentage',
    late_fee_amount BIGINT DEFAULT 0,
    late_fee_grace_period INT DEFAULT 5,
    tenant_deactivation_days INT DEFAULT 30,
    management_fee_percentage DECIMAL(5,2) DEFAULT 0.00,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (property_type_id) REFERENCES property_types(type_id)
);

-- =========================
-- PROPERTY AMENITIES (1NF FIX - Normalized from JSON)
-- =========================
CREATE TABLE property_amenities (
    amenity_id INT AUTO_INCREMENT PRIMARY KEY,
    property_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(property_id) ON DELETE CASCADE,
    UNIQUE KEY unique_property_amenity (property_id, name)
);

CREATE TABLE units (
    unit_id INT AUTO_INCREMENT PRIMARY KEY,
    property_id INT NOT NULL,
    unit_number VARCHAR(50) NOT NULL,
    unit_type_id INT NOT NULL,               -- [MODIFIED] FK to unit_types
    image_url VARCHAR(500),                  -- [ADDED] For primary unit image
    monthly_rent BIGINT NOT NULL,
    status ENUM('available', 'occupied', 'maintenance', 'reserved', 'inactive') DEFAULT 'available',
    is_turnover_cleared BOOLEAN DEFAULT TRUE, -- [NEW] Manual safety check for move-ins
    is_archived BOOLEAN DEFAULT FALSE,
    archived_at DATETIME,

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
    FOREIGN KEY (property_id) REFERENCES properties(property_id) ON DELETE CASCADE,
    UNIQUE KEY unique_property_image (property_id, image_url(255))
);

CREATE TABLE unit_images (
    image_id INT AUTO_INCREMENT PRIMARY KEY,
    unit_id INT NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    display_order INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE,
    UNIQUE KEY unique_unit_image (unit_id, image_url(255))
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
    preferred_term_months INT,               -- [ADDED] Desired lease duration
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
    lead_id INT NULL,
    tenant_id INT NULL,
    sender_id INT NULL,                      -- Set when sender is a user (owner/tenant/treasurer)
    sender_lead_id INT NULL,                 -- Set when sender is a lead (guest)
    sender_type ENUM('user','lead') NOT NULL DEFAULT 'user',
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (sender_lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE,
    CONSTRAINT chk_sender_consistency CHECK (
        (sender_type = 'user' AND sender_id IS NOT NULL) OR
        (sender_type = 'lead' AND sender_lead_id IS NOT NULL)
    )
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
-- UNIT LOCKS (Concurrent Process Protection)
-- =========================
CREATE TABLE unit_locks (
    unit_id INT PRIMARY KEY,
    lead_id INT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE,
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
    monthly_rent BIGINT NOT NULL,
    status ENUM('draft', 'active', 'expired', 'ended', 'cancelled') DEFAULT 'active',
    notice_status ENUM('undecided', 'vacating', 'renewing') DEFAULT 'undecided', -- [ADDED] Tenant's intent
    deposit_status ENUM('pending', 'paid', 'awaiting_approval', 'awaiting_acknowledgment', 'disputed', 'partially_refunded', 'refunded') DEFAULT 'pending', -- [B7 FIX] Added awaiting_acknowledgment
    proposed_refund_amount BIGINT DEFAULT 0,
    refund_notes TEXT,
    refunded_amount BIGINT DEFAULT 0,
    target_deposit BIGINT DEFAULT 0,                  -- Security deposit target amount in Cents
    document_url VARCHAR(500), -- [ADDED] Lease document URL
    verification_status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending', -- [NEW] Explicit verification state
    verification_rejection_reason TEXT, -- [NEW] Reason if documents are rejected
    actual_checkout_at DATETIME, -- [ADDED] Actual checkout time
    signed_at DATETIME, -- [NEW] Time when lease moved to active
    reservation_expires_at DATETIME, -- [NEW] Hard deadline for draft stage
    
    escalation_percentage DECIMAL(5,2) DEFAULT NULL, -- [NEW] E5 Automated Rent Escalation % (e.g. 5.00)
    escalation_period_months INT DEFAULT 12,        -- [NEW] E5 Frequency of escalation
    last_escalation_date DATE DEFAULT NULL,         -- [NEW] E5 Tracking for recurrence
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE RESTRICT
);

-- =========================
-- LEASE TERMS (Templates)
-- =========================
CREATE TABLE lease_terms (
    lease_term_id INT AUTO_INCREMENT PRIMARY KEY,
    owner_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50),                               -- e.g., 'fixed', 'month-to-month'
    duration_months INT,
    notice_period_months INT DEFAULT 1,
    is_default BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE
);
CREATE INDEX idx_lease_terms_owner ON lease_terms(owner_id);

-- =========================
-- LEASE RENT ADJUSTMENTS (Addendums)
-- =========================
CREATE TABLE lease_rent_adjustments (
    adjustment_id INT AUTO_INCREMENT PRIMARY KEY,
    lease_id INT NOT NULL,
    effective_date DATE NOT NULL,
    new_monthly_rent BIGINT NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lease_id) REFERENCES leases(lease_id) ON DELETE CASCADE,
    UNIQUE KEY unique_lease_adjustment (lease_id, effective_date)
);

-- =========================
-- RENT INVOICES
-- =========================
CREATE TABLE rent_invoices (
    invoice_id INT AUTO_INCREMENT PRIMARY KEY,
    lease_id INT NOT NULL,
    year SMALLINT NOT NULL,
    month TINYINT NOT NULL,
    amount BIGINT NOT NULL,
    due_date DATE NOT NULL,
    status ENUM('pending','partially_paid','paid','overdue','void') DEFAULT 'pending',
    invoice_type ENUM('rent', 'maintenance', 'late_fee', 'deposit', 'other') DEFAULT 'rent',
    description VARCHAR(255),
    magic_token_hash VARCHAR(255) DEFAULT NULL,       -- SHA-256 hash for guest payment links
    magic_token_expires_at DATETIME DEFAULT NULL,     -- Expiry for magic token
    last_order_id VARCHAR(100) DEFAULT NULL,           -- PayHere order tracking
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lease_id) REFERENCES leases(lease_id) ON DELETE RESTRICT,
    UNIQUE KEY unique_periodic_invoice (lease_id, year, month, invoice_type, due_date)
);

-- =========================
-- PAYMENTS
-- =========================
CREATE TABLE payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NOT NULL,
    amount BIGINT NOT NULL,
    payment_date DATE NOT NULL,
    payment_method VARCHAR(30),
    proof_url VARCHAR(255),
    reference_number VARCHAR(100),
    status ENUM('pending','verified','rejected') DEFAULT 'pending',
    verified_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    payout_id INT,
    FOREIGN KEY (invoice_id) REFERENCES rent_invoices(invoice_id) ON DELETE RESTRICT,
    FOREIGN KEY (verified_by) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (payout_id) REFERENCES owner_payouts(payout_id) ON DELETE SET NULL,
    UNIQUE KEY unique_payment_ref (reference_number)
);

-- =========================
-- RECEIPTS
-- =========================
CREATE TABLE receipts (
    receipt_id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT UNIQUE NOT NULL,
    amount BIGINT NOT NULL,
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
    FOREIGN KEY (tenant_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE maintenance_images (
    image_id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES maintenance_requests(request_id) ON DELETE CASCADE,
    UNIQUE KEY unique_request_image (request_id, image_url(255))
);

CREATE TABLE maintenance_costs (
    cost_id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    description VARCHAR(255),
    amount BIGINT NOT NULL,
    recorded_date DATE NOT NULL,
    bill_to ENUM('owner', 'tenant') DEFAULT 'owner',
    payout_id INT,
    status ENUM('active', 'voided') DEFAULT 'active',
    FOREIGN KEY (request_id) REFERENCES maintenance_requests(request_id) ON DELETE CASCADE,
    FOREIGN KEY (payout_id) REFERENCES owner_payouts(payout_id) ON DELETE SET NULL,
    UNIQUE KEY unique_cost_entry (request_id, description(255), amount, recorded_date)
);

-- =========================
-- NOTIFICATIONS
-- =========================
CREATE TABLE notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    message TEXT NOT NULL,
    type ENUM('invoice','lease','maintenance','payment','visit','system') NOT NULL,
    severity ENUM('info', 'warning', 'urgent') DEFAULT 'info',
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
    gross_amount BIGINT NOT NULL DEFAULT 0, -- Total rent in Cents
    commission_amount BIGINT NOT NULL DEFAULT 0, -- Agency fee in Cents
    expenses_amount BIGINT NOT NULL DEFAULT 0, -- Maintenance in Cents
    amount BIGINT AS (gross_amount - commission_amount - expenses_amount) STORED, -- [GENERATED] Final Net in Cents
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status ENUM('pending', 'paid', 'acknowledged', 'disputed') DEFAULT 'pending',
    bank_reference VARCHAR(100) DEFAULT NULL,
    proof_url VARCHAR(500) DEFAULT NULL,
    treasurer_id INT DEFAULT NULL,
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME DEFAULT NULL, -- Date mark as PAID
    acknowledged_at DATETIME DEFAULT NULL,
    dispute_reason TEXT DEFAULT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (treasurer_id) REFERENCES users(user_id) ON DELETE SET NULL,
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
    entity_type VARCHAR(30), -- [H17] Discriminator (e.g., 'invoice', 'lease')
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
    UNIQUE KEY unique_staff_property (user_id, property_id)
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
    debit BIGINT DEFAULT 0,
    credit BIGINT DEFAULT 0,
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

-- =========================
-- ADDITIONAL PERFORMANCE INDEXES (PRIORITY 2)
-- =========================
CREATE INDEX idx_notification_user_read ON notifications(user_id, is_read, created_at);
CREATE INDEX idx_audit_action ON system_audit_logs(action_type, created_at);
CREATE INDEX idx_audit_entity ON system_audit_logs(entity_id);
CREATE INDEX idx_payment_invoice_status ON payments(invoice_id, status);
CREATE INDEX idx_ledger_lease_category ON accounting_ledger(lease_id, category);
CREATE INDEX idx_leases_tenant_status ON leases(tenant_id, status);
CREATE INDEX idx_leases_unit_status ON leases(unit_id, status);


-- =========================
-- RENEWAL REQUESTS (Negotiation flow)
-- =========================
CREATE TABLE IF NOT EXISTS renewal_requests (
    request_id INT AUTO_INCREMENT PRIMARY KEY,
    lease_id INT NOT NULL,
    current_monthly_rent BIGINT NOT NULL,
    proposed_monthly_rent BIGINT NULL,
    proposed_end_date DATE NULL,
    status ENUM('pending', 'negotiating', 'approved', 'rejected', 'cancelled', 'expired') DEFAULT 'pending',
    negotiation_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (lease_id) REFERENCES leases(lease_id) ON DELETE CASCADE
);

-- =========================
-- CRON CHECKPOINTS (Backfill State)
-- =========================
-- [B5 FIX] Required by cronJobs.js backfill logic to track last successful execution
CREATE TABLE cron_checkpoints (
    job_name VARCHAR(50) PRIMARY KEY,
    last_success_date DATE NOT NULL,
    status ENUM('success', 'failed', 'running') DEFAULT 'success',
    message TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =========================
-- UNIT RENT HISTORY (Auditability)
-- =========================
CREATE TABLE unit_rent_history (
    history_id INT AUTO_INCREMENT PRIMARY KEY,
    unit_id INT NOT NULL,
    previous_rent BIGINT NOT NULL,
    new_rent BIGINT NOT NULL,
    changed_by INT,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX idx_rent_history_unit ON unit_rent_history(unit_id);
CREATE INDEX idx_amenity_property ON property_amenities(property_id);
