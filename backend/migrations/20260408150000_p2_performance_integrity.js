export const up = async (knex) => {
  // H8-H12: ADDITIONAL PERFORMANCE INDEXES
  await knex.schema.alterTable('notifications', (table) => {
    table.index(
      ['user_id', 'is_read', 'created_at'],
      'idx_notification_user_read'
    );
  });

  await knex.schema.alterTable('system_audit_logs', (table) => {
    table.index(['action_type', 'created_at'], 'idx_audit_action');
    table.index(['entity_id'], 'idx_audit_entity');
    // H17: Add entity_type
    table.string('entity_type', 30).nullable();
  });

  await knex.schema.alterTable('payments', (table) => {
    table.index(['invoice_id', 'status'], 'idx_payment_invoice_status');
  });

  await knex.schema.alterTable('accounting_ledger', (table) => {
    table.index(['lease_id', 'category'], 'idx_ledger_lease_category');
  });

  const hasDocsVerified = await knex.schema.hasColumn(
    'leases',
    'is_documents_verified'
  );
  await knex.schema.alterTable('leases', (table) => {
    table.index(['tenant_id', 'status'], 'idx_leases_tenant_status');
    table.index(['unit_id', 'status'], 'idx_leases_unit_status');
    // H14: Drop redundant column
    if (hasDocsVerified) {
      table.dropColumn('is_documents_verified');
    }
  });

  // H15: UNIQUE ON owners.nic
  // We check for duplicates first and print a warning if they exist.
  const ownerDuplicates = await knex('owners')
    .select('nic')
    .groupBy('nic')
    .havingRaw('COUNT(*) > 1')
    .whereNotNull('nic');

  if (ownerDuplicates.length > 0) {
    console.warn(
      `[Migration] Warning: Found duplicate NICs in owners table: ${ownerDuplicates.map((d) => d.nic).join(', ')}. UNIQUE constraint might fail.`
    );
  }

  try {
    await knex.schema.alterTable('owners', (table) => {
      table.unique('nic', 'unique_owner_nic');
    });
  } catch (err) {
    console.error(
      '[Migration] Failed to add UNIQUE constraint to owners.nic. Please clean up duplicates manually.'
    );
  }

  // H16: UNIQUE ON lease_rent_adjustments(lease_id, effective_date)
  try {
    await knex.schema.alterTable('lease_rent_adjustments', (table) => {
      table.unique(['lease_id', 'effective_date'], 'unique_lease_adjustment');
    });
  } catch (err) {
    console.error(
      '[Migration] Failed to add UNIQUE constraint to lease_rent_adjustments. Please clean up duplicates manually.'
    );
  }
};

export const down = async (knex) => {
  // REVERT H16
  await knex.schema.alterTable('lease_rent_adjustments', (table) => {
    table.dropUnique(['lease_id', 'effective_date'], 'unique_lease_adjustment');
  });

  // REVERT H15
  await knex.schema.alterTable('owners', (table) => {
    table.dropUnique('nic', 'unique_owner_nic');
  });

  // REVERT H14 & H8-H12
  await knex.schema.alterTable('leases', (table) => {
    table.boolean('is_documents_verified').defaultTo(false);
    table.dropIndex(['tenant_id', 'status'], 'idx_leases_tenant_status');
    table.dropIndex(['unit_id', 'status'], 'idx_leases_unit_status');
  });

  await knex.schema.alterTable('accounting_ledger', (table) => {
    table.dropIndex(['lease_id', 'category'], 'idx_ledger_lease_category');
  });

  await knex.schema.alterTable('payments', (table) => {
    table.dropIndex(['invoice_id', 'status'], 'idx_payment_invoice_status');
  });

  await knex.schema.alterTable('system_audit_logs', (table) => {
    table.dropColumn('entity_type');
    table.dropIndex(['action_type', 'created_at'], 'idx_audit_action');
    table.dropIndex(['entity_id'], 'idx_audit_entity');
  });

  await knex.schema.alterTable('notifications', (table) => {
    table.dropIndex(
      ['user_id', 'is_read', 'created_at'],
      'idx_notification_user_read'
    );
  });
};
