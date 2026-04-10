/**
 * Performance & Optimization Extension: Hardening Query Scale (G1, G2, G3, G4 & Rel)
 *
 * - G2: Missing Indexes for notifications, audit logs, payments, ledger, leases.
 * - Rel: Missing lease_term_id column added to leases table.
 * - G1-G4: Denormalization of rent_invoices.amount_paid for O(1) reads.
 */

export async function up(knex) {
  // G2: Missing Indexes
  await knex.schema.alterTable('notifications', (table) => {
    table.index(
      ['user_id', 'is_read', 'created_at'],
      'idx_notif_user_read_recent'
    );
  });

  await knex.schema.alterTable('system_audit_logs', (table) => {
    table.index(['action_type', 'created_at'], 'idx_audit_action_recent');
    table.index(['entity_id'], 'idx_audit_entity');
  });

  await knex.schema.alterTable('payments', (table) => {
    table.index(['invoice_id', 'status'], 'idx_pay_invoice_status');
  });

  await knex.schema.alterTable('accounting_ledger', (table) => {
    table.index(['lease_id', 'category'], 'idx_ledger_lease_cat');
  });

  await knex.schema.alterTable('leases', (table) => {
    table.index(['tenant_id', 'status'], 'idx_lease_tenant_status');
    table.index(['unit_id', 'status'], 'idx_lease_unit_status');
  });

  // Rel: Missing lease_term_id in leases
  if (await knex.schema.hasTable('leases')) {
    await knex.schema.alterTable('leases', (table) => {
      table.integer('lease_term_id').unsigned().nullable();
      table
        .foreign('lease_term_id')
        .references('lease_terms.lease_term_id')
        .onDelete('SET NULL');
    });
  }

  // G1-G4: Materialized amount_paid on rent_invoices
  if (await knex.schema.hasTable('rent_invoices')) {
    await knex.schema.alterTable('rent_invoices', (table) => {
      table.bigInteger('amount_paid').defaultTo(0).notNullable();
    });

    // Backfill historical verified payment totals
    await knex.raw(`
      UPDATE rent_invoices ri
      JOIN (
        SELECT invoice_id, SUM(amount) as total_paid
        FROM payments
        WHERE status = 'verified'
        GROUP BY invoice_id
      ) p ON ri.invoice_id = p.invoice_id
      SET ri.amount_paid = p.total_paid
    `);
  }
}

export async function down(knex) {
  if (await knex.schema.hasTable('rent_invoices')) {
    await knex.schema.alterTable('rent_invoices', (table) => {
      table.dropColumn('amount_paid');
    });
  }

  if (await knex.schema.hasTable('leases')) {
    await knex.schema.alterTable('leases', (table) => {
      table.dropForeign('lease_term_id');
      table.dropColumn('lease_term_id');
    });
  }

  await knex.schema.alterTable('leases', (table) => {
    table.dropIndex([], 'idx_lease_unit_status');
    table.dropIndex([], 'idx_lease_tenant_status');
  });

  await knex.schema.alterTable('accounting_ledger', (table) => {
    table.dropIndex([], 'idx_ledger_lease_cat');
  });

  await knex.schema.alterTable('payments', (table) => {
    table.dropIndex([], 'idx_pay_invoice_status');
  });

  await knex.schema.alterTable('system_audit_logs', (table) => {
    table.dropIndex([], 'idx_audit_entity');
    table.dropIndex([], 'idx_audit_action_recent');
  });

  await knex.schema.alterTable('notifications', (table) => {
    table.dropIndex([], 'idx_notif_user_read_recent');
  });
}
