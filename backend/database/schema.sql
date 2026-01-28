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
    role ENUM('owner','tenant','treasurer','lead') NOT NULL,
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
    nic VARCHAR(20) UNIQUE,              -- NIC (Old or New format)
    permanent_address VARCHAR(255),      -- Legal address per NIC
    emergency_contact_name VARCHAR(100),
    emergency_contact_phone VARCHAR(20),
    employer_name VARCHAR(100),
    employment_status ENUM('employed', 'self-employed', 'student', 'unemployed'),
    monthly_income DECIMAL(15,2),        -- LKR
    date_of_birth DATE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
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
    residence_address VARCHAR(255),      -- Mailing address
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
    FOREIGN KEY (owner_id) REFERENCES users(user_id),
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
    FOREIGN KEY (property_id) REFERENCES properties(property_id),
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
    user_id INT,    -- Link to User account (Lead or Tenant role)
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(100),
    status ENUM('interested','converted','dropped') DEFAULT 'interested',
    notes TEXT,
    score INT DEFAULT 0,                     -- [ADDED] Lead scoring
    last_contacted_at DATETIME,              -- [ADDED] For follow-up tracking
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(property_id),
    FOREIGN KEY (unit_id) REFERENCES units(unit_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
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
    CONSTRAINT fk_stage_history_lead
        FOREIGN KEY (lead_id) REFERENCES leads(lead_id)
        ON DELETE CASCADE
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
    status ENUM('active','ended') DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES users(user_id),
    FOREIGN KEY (unit_id) REFERENCES units(unit_id)
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
    status ENUM('pending','paid','overdue') DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (lease_id, year, month),
    FOREIGN KEY (lease_id) REFERENCES leases(lease_id)
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
    FOREIGN KEY (invoice_id) REFERENCES rent_invoices(invoice_id),
    FOREIGN KEY (verified_by) REFERENCES users(user_id)
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
    FOREIGN KEY (payment_id) REFERENCES payments(payment_id)
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
    FOREIGN KEY (unit_id) REFERENCES units(unit_id),
    FOREIGN KEY (tenant_id) REFERENCES users(user_id)
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
    FOREIGN KEY (request_id) REFERENCES maintenance_requests(request_id)
);

-- =========================
-- NOTIFICATIONS
-- =========================
CREATE TABLE notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    message TEXT NOT NULL,
    type ENUM('invoice','lease','maintenance') NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

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