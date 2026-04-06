export const up = async (knex) => {
  // BASELINE CHECK: If the 'users' table already exists, we assume the initial schema 
  // is already present and skip the raw SQL execution to prevent errors.
  const hasTable = await knex.schema.hasTable('users');
  if (hasTable) {
    console.log('[Migration] "users" table detected. Marking baseline as complete without execution.');
    return;
  }

  // We use knex.raw to execute the existing schema.sql logic for fresh environments.
  await knex.raw(`
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
    -- ROLE PROFILES
    -- =========================
    CREATE TABLE tenants (
        user_id INT PRIMARY KEY,
        nic VARCHAR(20) UNIQUE,
        nic_url VARCHAR(500),
        permanent_address VARCHAR(255),
        emergency_contact_name VARCHAR(100),
        emergency_contact_phone VARCHAR(20),
        employment_status ENUM('employed', 'self-employed', 'student', 'unemployed'),
        monthly_income BIGINT,
        behavior_score INT DEFAULT 100,
        credit_balance BIGINT DEFAULT 0,
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

    CREATE TABLE owners (
        user_id INT PRIMARY KEY,
        nic VARCHAR(20),
        tin VARCHAR(50),
        tin_url VARCHAR(500),
        bank_name VARCHAR(100),
        branch_name VARCHAR(100),
        account_holder_name VARCHAR(100),
        account_number VARCHAR(50),
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

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
    CREATE TABLE property_types (
        type_id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        description VARCHAR(255)
    );

    CREATE TABLE unit_types (
        type_id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        description VARCHAR(255)
    );

    CREATE TABLE properties (
        property_id INT AUTO_INCREMENT PRIMARY KEY,
        owner_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        property_type_id INT NOT NULL,
        property_no VARCHAR(50),
        street VARCHAR(255) NOT NULL,
        city VARCHAR(100) NOT NULL,
        district VARCHAR(100) NOT NULL,
        image_url VARCHAR(500),
        description TEXT,
        features JSON,
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

    CREATE TABLE units (
        unit_id INT AUTO_INCREMENT PRIMARY KEY,
        property_id INT NOT NULL,
        unit_number VARCHAR(50) NOT NULL,
        unit_type_id INT NOT NULL,
        image_url VARCHAR(500),
        monthly_rent BIGINT NOT NULL,
        status ENUM('available', 'occupied', 'maintenance', 'reserved', 'inactive') DEFAULT 'available',
        is_turnover_cleared BOOLEAN DEFAULT TRUE,
        is_archived BOOLEAN DEFAULT FALSE,
        archived_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (property_id, unit_number),
        FOREIGN KEY (property_id) REFERENCES properties(property_id) ON DELETE CASCADE,
        FOREIGN KEY (unit_type_id) REFERENCES unit_types(type_id)
    );

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
        property_id INT NOT NULL,
        unit_id INT NULL,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        email VARCHAR(100),
        status ENUM('interested','converted','dropped') DEFAULT 'interested',
        notes TEXT,
        internal_notes TEXT,
        move_in_date DATE,
        occupants_count INT DEFAULT 1,
        preferred_term_months INT,
        score INT DEFAULT 0,
        last_contacted_at DATETIME,
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
        FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE
    );

    CREATE TABLE messages (
        message_id INT AUTO_INCREMENT PRIMARY KEY,
        lead_id INT NULL,
        tenant_id INT NULL,
        sender_id INT NULL,
        sender_lead_id INT NULL,
        sender_type ENUM('user','lead') NOT NULL DEFAULT 'user',
        content TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (sender_lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE
    );

    CREATE TABLE lead_access_tokens (
        token_id INT AUTO_INCREMENT PRIMARY KEY,
        lead_id INT NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE
    );

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
        notice_status ENUM('undecided', 'vacating', 'renewing') DEFAULT 'undecided',
        deposit_status ENUM('pending', 'paid', 'awaiting_approval', 'awaiting_acknowledgment', 'disputed', 'partially_refunded', 'refunded') DEFAULT 'pending',
        proposed_refund_amount BIGINT DEFAULT 0,
        refund_notes TEXT,
        refunded_amount BIGINT DEFAULT 0,
        document_url VARCHAR(500),
        is_documents_verified BOOLEAN DEFAULT FALSE,
        verification_status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
        verification_rejection_reason TEXT,
        actual_checkout_at DATETIME,
        signed_at DATETIME,
        reservation_expires_at DATETIME,
        escalation_percentage DECIMAL(5,2) DEFAULT NULL,
        escalation_period_months INT DEFAULT 12,
        last_escalation_date DATE DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES users(user_id) ON DELETE RESTRICT,
        FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE RESTRICT
    );

    CREATE TABLE lease_rent_adjustments (
        adjustment_id INT AUTO_INCREMENT PRIMARY KEY,
        lease_id INT NOT NULL,
        effective_date DATE NOT NULL,
        new_monthly_rent BIGINT NOT NULL,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (lease_id) REFERENCES leases(lease_id) ON DELETE CASCADE
    );

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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (lease_id) REFERENCES leases(lease_id) ON DELETE RESTRICT,
        UNIQUE KEY unique_periodic_invoice (lease_id, year, month, invoice_type)
    );

    CREATE TABLE owner_payouts (
        payout_id INT AUTO_INCREMENT PRIMARY KEY,
        owner_id INT NOT NULL,
        gross_amount BIGINT NOT NULL DEFAULT 0,
        commission_amount BIGINT NOT NULL DEFAULT 0,
        expenses_amount BIGINT NOT NULL DEFAULT 0,
        amount BIGINT NOT NULL,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        status ENUM('pending', 'paid', 'acknowledged', 'disputed') DEFAULT 'pending',
        bank_reference VARCHAR(100) DEFAULT NULL,
        proof_url VARCHAR(500) DEFAULT NULL,
        treasurer_id INT DEFAULT NULL,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME DEFAULT NULL,
        acknowledged_at DATETIME DEFAULT NULL,
        dispute_reason TEXT DEFAULT NULL,
        FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (treasurer_id) REFERENCES users(user_id) ON DELETE SET NULL,
        UNIQUE KEY unique_owner_payout_period (owner_id, period_start, period_end)
    );

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

    CREATE TABLE receipts (
        receipt_id INT AUTO_INCREMENT PRIMARY KEY,
        payment_id INT UNIQUE NOT NULL,
        amount BIGINT NOT NULL,
        receipt_date DATE NOT NULL,
        receipt_number VARCHAR(50) UNIQUE NOT NULL,
        FOREIGN KEY (payment_id) REFERENCES payments(payment_id) ON DELETE CASCADE
    );

    CREATE TABLE maintenance_requests (
        request_id INT AUTO_INCREMENT PRIMARY KEY,
        unit_id INT NOT NULL,
        tenant_id INT NOT NULL,
        title VARCHAR(150) NOT NULL,
        description TEXT NOT NULL,
        priority ENUM('low','medium','high','urgent') DEFAULT 'medium',
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

    CREATE TABLE system_audit_logs (
        log_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        action_type VARCHAR(50) NOT NULL,
        entity_id INT,
        details TEXT,
        ip_address VARCHAR(45),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
    );

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

    CREATE TABLE staff_property_assignments (
        assignment_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        property_id INT NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (property_id) REFERENCES properties(property_id) ON DELETE CASCADE,
        UNIQUE KEY unique_property (property_id)
    );

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

    CREATE TABLE renewal_requests (
        request_id INT AUTO_INCREMENT PRIMARY KEY,
        lease_id INT NOT NULL,
        current_monthly_rent BIGINT NOT NULL,
        proposed_monthly_rent BIGINT NULL,
        proposed_end_date DATE NULL,
        status ENUM('pending', 'negotiating', 'approved', 'rejected', 'cancelled') DEFAULT 'pending',
        negotiation_notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (lease_id) REFERENCES leases(lease_id) ON DELETE CASCADE
    );

    CREATE TABLE cron_checkpoints (
        job_name VARCHAR(50) PRIMARY KEY,
        last_success_date DATE NOT NULL,
        status ENUM('success', 'failed') DEFAULT 'success',
        message TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );

    -- =========================
    -- INDEXES
    -- =========================
    CREATE INDEX idx_ledger_lease ON accounting_ledger(lease_id);
    CREATE INDEX idx_ledger_account_type ON accounting_ledger(account_type);
    CREATE INDEX idx_ledger_entry_date ON accounting_ledger(entry_date);
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
  `);
};

export const down = async (knex) => {
  // To keep it clean, we drop tables in reverse order of creation
  // and handle foreign key constraints by disabling checks temporarily.
  await knex.raw('SET FOREIGN_KEY_CHECKS = 0');
  
  const tables = [
    'cron_checkpoints',
    'renewal_requests',
    'accounting_ledger',
    'staff_property_assignments',
    'property_visits',
    'system_audit_logs',
    'notifications',
    'maintenance_costs',
    'maintenance_images',
    'maintenance_requests',
    'receipts',
    'payments',
    'owner_payouts',
    'rent_invoices',
    'lease_rent_adjustments',
    'leases',
    'unit_locks',
    'lead_access_tokens',
    'messages',
    'lead_stage_history',
    'lead_followups',
    'leads',
    'unit_images',
    'property_images',
    'units',
    'properties',
    'unit_types',
    'property_types',
    'staff',
    'owners',
    'tenant_behavior_logs',
    'tenants',
    'users'
  ];

  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }

  await knex.raw('SET FOREIGN_KEY_CHECKS = 1');
};
