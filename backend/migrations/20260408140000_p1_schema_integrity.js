export const up = async (knex) => {
  // H4: LEASE TERMS TABLE
  const hasLeaseTerms = await knex.schema.hasTable('lease_terms');
  if (!hasLeaseTerms) {
    await knex.schema.createTable('lease_terms', (table) => {
      table.increments('lease_term_id').primary();
      table.integer('owner_id').notNullable();
      table.string('name', 100).notNullable();
      table.string('type', 50);
      table.integer('duration_months');
      table.integer('notice_period_months').defaultTo(1);
      table.boolean('is_default').defaultTo(false);
      table.datetime('created_at').defaultTo(knex.fn.now());
      table.foreign('owner_id').references('users.user_id').onDelete('CASCADE');
      table.index('owner_id', 'idx_lease_terms_owner');
    });
  }

  // H2: RENT_INVOICES MISSING COLUMNS
  await knex.schema.alterTable('rent_invoices', (table) => {
    if (!knex.schema.hasColumn('rent_invoices', 'magic_token_hash')) {
      table.string('magic_token_hash', 255).nullable();
    }
    if (!knex.schema.hasColumn('rent_invoices', 'magic_token_expires_at')) {
      table.datetime('magic_token_expires_at').nullable();
    }
    if (!knex.schema.hasColumn('rent_invoices', 'last_order_id')) {
      table.string('last_order_id', 100).nullable();
    }
  });

  // H3: LEASES MISSING TARGET_DEPOSIT
  const hasTargetDeposit = await knex.schema.hasColumn(
    'leases',
    'target_deposit'
  );
  if (!hasTargetDeposit) {
    await knex.schema.alterTable('leases', (table) => {
      table.bigInteger('target_deposit').defaultTo(0);
    });
  }

  // H1: RENT_INVOICES UNIQUE KEY UPDATE
  // We drop the old one and add the new one.
  // Knex doesn't have an easy "hasUnique" so we use raw to be safe or try-catch.
  try {
    await knex.raw(
      'ALTER TABLE rent_invoices DROP INDEX unique_periodic_invoice'
    );
  } catch (err) {
    // Index might not exist or have a different name in some environments
    console.warn(
      '[Migration] Could not drop unique_periodic_invoice index, it might not exist.'
    );
  }
  await knex.raw(
    'ALTER TABLE rent_invoices ADD UNIQUE KEY unique_periodic_invoice (lease_id, year, month, invoice_type, due_date)'
  );

  // H5: CRON_CHECKPOINTS STATUS ENUM
  await knex.raw(
    "ALTER TABLE cron_checkpoints MODIFY COLUMN status ENUM('success', 'failed', 'running') DEFAULT 'success'"
  );

  // H6: RENEWAL_REQUESTS STATUS ENUM
  await knex.raw(
    "ALTER TABLE renewal_requests MODIFY COLUMN status ENUM('pending', 'negotiating', 'approved', 'rejected', 'cancelled', 'expired') DEFAULT 'pending'"
  );

  // H7: MESSAGES CHECK CONSTRAINT
  // Note: CHECK constraints require MySQL 8.0.16+
  try {
    await knex.raw(`
      ALTER TABLE messages ADD CONSTRAINT chk_sender_consistency CHECK (
        (sender_type = 'user' AND sender_id IS NOT NULL) OR
        (sender_type = 'lead' AND sender_lead_id IS NOT NULL)
      )
    `);
  } catch (err) {
    console.warn(
      '[Migration] Could not add CHECK constraint to messages. This is expected if MySQL version is < 8.0.16.'
    );
  }
};

export const down = async (knex) => {
  // REVERT H7
  try {
    await knex.raw(
      'ALTER TABLE messages DROP CONSTRAINT chk_sender_consistency'
    );
  } catch (err) {}

  // REVERT H6 (Back to original ENUM)
  await knex.raw(
    "ALTER TABLE renewal_requests MODIFY COLUMN status ENUM('pending', 'negotiating', 'approved', 'rejected', 'cancelled') DEFAULT 'pending'"
  );

  // REVERT H5
  await knex.raw(
    "ALTER TABLE cron_checkpoints MODIFY COLUMN status ENUM('success', 'failed') DEFAULT 'success'"
  );

  // REVERT H1
  try {
    await knex.raw(
      'ALTER TABLE rent_invoices DROP INDEX unique_periodic_invoice'
    );
  } catch (err) {}
  await knex.raw(
    'ALTER TABLE rent_invoices ADD UNIQUE KEY unique_periodic_invoice (lease_id, year, month, invoice_type)'
  );

  // REVERT H3
  await knex.schema.alterTable('leases', (table) => {
    table.dropColumn('target_deposit');
  });

  // REVERT H2
  await knex.schema.alterTable('rent_invoices', (table) => {
    table.dropColumn('magic_token_hash');
    table.dropColumn('magic_token_expires_at');
    table.dropColumn('last_order_id');
  });

  // REVERT H4
  await knex.schema.dropTableIfExists('lease_terms');
};
