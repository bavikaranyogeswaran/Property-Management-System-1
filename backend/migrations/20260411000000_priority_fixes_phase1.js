/**
 * Priority Fixes — Phase 1 Migration
 * ====================================
 * Implements all safe, additive schema fixes from the audit plan.
 * Nothing is dropped that existing application code still reads.
 * Every change is backward compatible.
 *
 * Fixes applied in this migration:
 *  H1  — DB Triggers for rent_invoices.amount_paid (INSERT + UPDATE on payments)
 *  H12 — Drop duplicate idx_audit_action index on system_audit_logs
 *  H13 — Add idx_payment_payout_status on payments(payout_id, status)
 *  H15 — Add assigned_to, assigned_by columns to maintenance_requests
 *  H16 — Drop lead_stage_history.duration_in_previous_stage (computed stale field)
 *  H17 — Add expires_at to notifications
 *  H18 — Change system_audit_logs.details from TEXT to JSON
 *  H19 — Add requested_by ENUM to renewal_requests
 *  H22 — Add assigned_staff_id to property_visits
 *  H23 — Change maintenance_requests.tenant_id FK from CASCADE to RESTRICT
 */

export async function up(knex) {
  // ─── H1: amount_paid Triggers ────────────────────────────────────────────
  // Replace unreliable application-layer cache maintenance with DB triggers.
  // Two triggers: one for INSERT (new payment added), one for UPDATE (status change).

  // Ensure trigger creation is allowed even if binary logging is enabled
  try {
    await knex.raw('SET GLOBAL log_bin_trust_function_creators = 1');
  } catch (err) {
    console.warn(
      '[H1] Could not set log_bin_trust_function_creators:',
      err.message
    );
  }

  // Backfill: Recompute all existing amount_paid values from scratch
  // so triggers start from a clean state.
  await knex.raw(`
    UPDATE rent_invoices ri
    JOIN (
      SELECT invoice_id, COALESCE(SUM(amount), 0) AS total_paid
      FROM payments
      WHERE status = 'verified'
      GROUP BY invoice_id
    ) p ON ri.invoice_id = p.invoice_id
    SET ri.amount_paid = p.total_paid
  `);

  // Zero out invoices with no verified payments (fixes any legacy over-reporting)
  await knex.raw(`
    UPDATE rent_invoices
    SET amount_paid = 0
    WHERE invoice_id NOT IN (
      SELECT DISTINCT invoice_id FROM payments WHERE status = 'verified'
    )
  `);

  // Drop triggers if they already exist (idempotent re-run safety)
  await knex.raw('DROP TRIGGER IF EXISTS trg_invoice_amount_paid_insert');
  await knex.raw('DROP TRIGGER IF EXISTS trg_invoice_amount_paid_update');

  // Trigger 1: AFTER INSERT on payments
  await knex.raw(`
    CREATE TRIGGER trg_invoice_amount_paid_insert
    AFTER INSERT ON payments
    FOR EACH ROW
    BEGIN
      IF NEW.status = 'verified' THEN
        UPDATE rent_invoices
        SET amount_paid = (
          SELECT COALESCE(SUM(p2.amount), 0)
          FROM payments p2
          WHERE p2.invoice_id = NEW.invoice_id
            AND p2.status = 'verified'
        )
        WHERE invoice_id = NEW.invoice_id;
      END IF;
    END
  `);

  // Trigger 2: AFTER UPDATE on payments (handles both gains and losses of 'verified' status)
  await knex.raw(`
    CREATE TRIGGER trg_invoice_amount_paid_update
    AFTER UPDATE ON payments
    FOR EACH ROW
    BEGIN
      IF OLD.status != NEW.status AND
         (OLD.status = 'verified' OR NEW.status = 'verified') THEN
        UPDATE rent_invoices
        SET amount_paid = (
          SELECT COALESCE(SUM(p2.amount), 0)
          FROM payments p2
          WHERE p2.invoice_id = NEW.invoice_id
            AND p2.status = 'verified'
        )
        WHERE invoice_id = NEW.invoice_id;
      END IF;
    END
  `);

  console.log('[H1] amount_paid triggers created and backfill complete.');

  // ─── H12: Drop duplicate audit index ────────────────────────────────────
  // Migration 20260408150000 added idx_audit_action (action_type, created_at).
  // Migration 20260410160000 added idx_audit_action_recent — identical columns.
  // Drop the older name; keep the newer one.
  try {
    const [indexes] = await knex.raw(`
      SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'system_audit_logs'
        AND INDEX_NAME = 'idx_audit_action'
    `);
    if (indexes.length > 0) {
      await knex.raw(
        'ALTER TABLE system_audit_logs DROP INDEX idx_audit_action'
      );
      console.log('[H12] Duplicate index idx_audit_action dropped.');
    } else {
      console.log('[H12] idx_audit_action not found — skipping.');
    }
  } catch (err) {
    console.warn('[H12] Could not drop duplicate index:', err.message);
  }

  // ─── H13: Add payment payout+status index ───────────────────────────────
  // Supports calculateNetPayout() filter: payout_id IS NULL AND status = 'verified'
  try {
    const [existing] = await knex.raw(`
      SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'payments'
        AND INDEX_NAME = 'idx_payment_payout_status'
    `);
    if (existing.length === 0) {
      await knex.raw(
        'ALTER TABLE payments ADD INDEX idx_payment_payout_status (payout_id, status)'
      );
      console.log('[H13] idx_payment_payout_status index added.');
    } else {
      console.log('[H13] idx_payment_payout_status already exists — skipping.');
    }
  } catch (err) {
    console.warn('[H13] Could not add payout-status index:', err.message);
  }

  // ─── H15: maintenance_requests — add assigned_to, assigned_by ───────────
  if (await knex.schema.hasTable('maintenance_requests')) {
    if (!(await knex.schema.hasColumn('maintenance_requests', 'assigned_to'))) {
      await knex.schema.alterTable('maintenance_requests', (table) => {
        table
          .integer('assigned_to')
          .nullable()
          .after('tenant_id')
          .comment('Staff member responsible for resolving this request');
        table
          .integer('assigned_by')
          .nullable()
          .after('assigned_to')
          .comment('User who made the assignment');
        table
          .foreign('assigned_to')
          .references('users.user_id')
          .onDelete('SET NULL');
        table
          .foreign('assigned_by')
          .references('users.user_id')
          .onDelete('SET NULL');
      });
      console.log(
        '[H15] maintenance_requests: assigned_to, assigned_by columns added.'
      );
    } else {
      console.log(
        '[H15] maintenance_requests: assignment columns already exist — skipping.'
      );
    }
  }

  // ─── H16: lead_stage_history — drop duration_in_previous_stage ──────────
  if (await knex.schema.hasTable('lead_stage_history')) {
    if (
      await knex.schema.hasColumn(
        'lead_stage_history',
        'duration_in_previous_stage'
      )
    ) {
      await knex.schema.alterTable('lead_stage_history', (table) => {
        table.dropColumn('duration_in_previous_stage');
      });
      console.log(
        '[H16] lead_stage_history.duration_in_previous_stage dropped.'
      );
    } else {
      console.log(
        '[H16] duration_in_previous_stage already absent — skipping.'
      );
    }
  }

  // ─── H17: notifications — add expires_at ────────────────────────────────
  if (await knex.schema.hasTable('notifications')) {
    if (!(await knex.schema.hasColumn('notifications', 'expires_at'))) {
      await knex.schema.alterTable('notifications', (table) => {
        table
          .datetime('expires_at')
          .nullable()
          .after('is_read')
          .comment('Optional expiry; NULL means never expires');
      });
      // Backfill: Set expiry for old read notifications to 90 days ago so
      // a future purge job can clean them up without affecting unread ones.
      await knex.raw(`
        UPDATE notifications
        SET expires_at = DATE_ADD(created_at, INTERVAL 90 DAY)
        WHERE is_read = TRUE AND expires_at IS NULL
      `);
      try {
        await knex.raw(
          'CREATE INDEX idx_notification_expiry ON notifications(expires_at)'
        );
      } catch (idxErr) {
        console.warn('[H17] Expiry index already exists:', idxErr.message);
      }
      console.log('[H17] notifications.expires_at column added.');
    } else {
      console.log('[H17] notifications.expires_at already exists — skipping.');
    }
  }

  // ─── H18: system_audit_logs — details TEXT → JSON ───────────────────────
  // MySQL allows converting TEXT to JSON only if all existing values are valid JSON.
  // We sanitize first: wrap any non-JSON text values in a JSON string.
  if (await knex.schema.hasTable('system_audit_logs')) {
    try {
      // Check current column type
      const [colInfo] = await knex.raw(`
        SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'system_audit_logs'
          AND COLUMN_NAME = 'details'
      `);
      if (colInfo[0]?.DATA_TYPE?.toLowerCase() !== 'json') {
        // Sanitize: wrap any value that isn't valid JSON into a JSON string
        await knex.raw(`
          UPDATE system_audit_logs
          SET details = JSON_OBJECT('raw', details)
          WHERE details IS NOT NULL
            AND details != ''
            AND NOT JSON_VALID(details)
        `);
        await knex.raw(
          "ALTER TABLE system_audit_logs MODIFY COLUMN details JSON NULL COMMENT 'Structured event metadata'"
        );
        console.log('[H18] system_audit_logs.details converted to JSON type.');
      } else {
        console.log(
          '[H18] system_audit_logs.details is already JSON — skipping.'
        );
      }
    } catch (err) {
      console.warn(
        '[H18] Could not convert details to JSON (existing data may be invalid):',
        err.message
      );
    }
  }

  // ─── H19: renewal_requests — add requested_by ───────────────────────────
  if (await knex.schema.hasTable('renewal_requests')) {
    if (!(await knex.schema.hasColumn('renewal_requests', 'requested_by'))) {
      await knex.schema.alterTable('renewal_requests', (table) => {
        table
          .enum('requested_by', ['tenant', 'staff', 'system'])
          .notNullable()
          .defaultTo('system')
          .after('lease_id')
          .comment('Who initiated this renewal request');
      });
      console.log('[H19] renewal_requests.requested_by column added.');
    } else {
      console.log(
        '[H19] renewal_requests.requested_by already exists — skipping.'
      );
    }
  }

  // ─── H22: property_visits — add assigned_staff_id ───────────────────────
  if (await knex.schema.hasTable('property_visits')) {
    if (
      !(await knex.schema.hasColumn('property_visits', 'assigned_staff_id'))
    ) {
      await knex.schema.alterTable('property_visits', (table) => {
        table
          .integer('assigned_staff_id')
          .nullable()
          .after('lead_id')
          .comment('Staff member conducting the visit');
        table
          .foreign('assigned_staff_id')
          .references('users.user_id')
          .onDelete('SET NULL');
      });
      console.log('[H22] property_visits.assigned_staff_id column added.');
    } else {
      console.log(
        '[H22] property_visits.assigned_staff_id already exists — skipping.'
      );
    }
  }

  // ─── H23: maintenance_requests.tenant_id FK — CASCADE → RESTRICT ────────
  // Prevents accidental erasure of maintenance history when a user is deleted.
  try {
    const [fkRows] = await knex.raw(`
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_NAME = 'maintenance_requests'
        AND TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME = 'tenant_id'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `);

    if (fkRows.length > 0) {
      const constraintName = fkRows[0].CONSTRAINT_NAME;

      // Check current delete rule
      const [ruleCheck] = await knex.raw(
        `
        SELECT DELETE_RULE
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_NAME = ?
          AND CONSTRAINT_SCHEMA = DATABASE()
      `,
        [constraintName]
      );

      if (ruleCheck[0]?.DELETE_RULE === 'CASCADE') {
        await knex.raw(
          `ALTER TABLE maintenance_requests DROP FOREIGN KEY ${constraintName}`
        );
        await knex.raw(`
          ALTER TABLE maintenance_requests
          ADD CONSTRAINT fk_maintenance_tenant_restrict
          FOREIGN KEY (tenant_id) REFERENCES users(user_id)
          ON DELETE RESTRICT
        `);
        console.log(
          '[H23] maintenance_requests.tenant_id FK changed from CASCADE to RESTRICT.'
        );
      } else {
        console.log('[H23] FK already RESTRICT or not CASCADE — skipping.');
      }
    }
  } catch (err) {
    console.warn(
      '[H23] Could not change maintenance_requests FK:',
      err.message
    );
  }
}

export async function down(knex) {
  // ─── Reverse H23 ─────────────────────────────────────────────────────────
  try {
    const [fkRows] = await knex.raw(`
      SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_NAME = 'maintenance_requests'
        AND TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME = 'tenant_id'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `);
    if (fkRows.length > 0) {
      await knex.raw(
        `ALTER TABLE maintenance_requests DROP FOREIGN KEY ${fkRows[0].CONSTRAINT_NAME}`
      );
      await knex.raw(`
        ALTER TABLE maintenance_requests
        ADD CONSTRAINT fk_maintenance_tenant_cascade
        FOREIGN KEY (tenant_id) REFERENCES users(user_id)
        ON DELETE CASCADE
      `);
    }
  } catch (err) {
    console.warn('[Rollback H23]', err.message);
  }

  // ─── Reverse H22 ─────────────────────────────────────────────────────────
  if (await knex.schema.hasColumn('property_visits', 'assigned_staff_id')) {
    await knex.schema.alterTable('property_visits', (table) => {
      table.dropForeign('assigned_staff_id');
      table.dropColumn('assigned_staff_id');
    });
  }

  // ─── Reverse H19 ─────────────────────────────────────────────────────────
  if (await knex.schema.hasColumn('renewal_requests', 'requested_by')) {
    await knex.schema.alterTable('renewal_requests', (table) => {
      table.dropColumn('requested_by');
    });
  }

  // ─── Reverse H18 ─────────────────────────────────────────────────────────
  try {
    await knex.raw(
      'ALTER TABLE system_audit_logs MODIFY COLUMN details TEXT NULL'
    );
  } catch (err) {
    console.warn('[Rollback H18]', err.message);
  }

  // ─── Reverse H17 ─────────────────────────────────────────────────────────
  if (await knex.schema.hasColumn('notifications', 'expires_at')) {
    try {
      await knex.raw(
        'ALTER TABLE notifications DROP INDEX idx_notification_expiry'
      );
    } catch (err) {}
    await knex.schema.alterTable('notifications', (table) => {
      table.dropColumn('expires_at');
    });
  }

  // ─── Reverse H16 ─────────────────────────────────────────────────────────
  if (
    !(await knex.schema.hasColumn(
      'lead_stage_history',
      'duration_in_previous_stage'
    ))
  ) {
    await knex.schema.alterTable('lead_stage_history', (table) => {
      table.integer('duration_in_previous_stage').nullable();
    });
  }

  // ─── Reverse H15 ─────────────────────────────────────────────────────────
  if (await knex.schema.hasColumn('maintenance_requests', 'assigned_to')) {
    await knex.schema.alterTable('maintenance_requests', (table) => {
      table.dropForeign('assigned_to');
      table.dropForeign('assigned_by');
      table.dropColumn('assigned_to');
      table.dropColumn('assigned_by');
    });
  }

  // ─── Reverse H13 ─────────────────────────────────────────────────────────
  try {
    await knex.raw('ALTER TABLE payments DROP INDEX idx_payment_payout_status');
  } catch (err) {
    console.warn('[Rollback H13]', err.message);
  }

  // ─── Reverse H12 — re-add the old duplicate index ────────────────────────
  try {
    await knex.raw(
      'CREATE INDEX idx_audit_action ON system_audit_logs(action_type, created_at)'
    );
  } catch (err) {
    console.warn('[Rollback H12]', err.message);
  }

  // ─── Reverse H1 — drop triggers ───────────────────────────────────────────
  await knex.raw('DROP TRIGGER IF EXISTS trg_invoice_amount_paid_insert');
  await knex.raw('DROP TRIGGER IF EXISTS trg_invoice_amount_paid_update');
}
