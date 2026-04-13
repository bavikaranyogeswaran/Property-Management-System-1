export const up = async (knex) => {
  if (await knex.schema.hasTable('maintenance_costs')) {
    const hasInvoiceId = await knex.schema.hasColumn(
      'maintenance_costs',
      'invoice_id'
    );
    const hasIsReimbursable = await knex.schema.hasColumn(
      'maintenance_costs',
      'is_reimbursable'
    );

    // 1. Ensure columns exist and have correct types
    await knex.schema.alterTable('maintenance_costs', (table) => {
      if (!hasInvoiceId) {
        table.integer('invoice_id').nullable().after('recorded_date');
      } else {
        // Ensure it is NOT unsigned, to match rent_invoices.invoice_id
        table.integer('invoice_id').nullable().alter();
      }

      if (!hasIsReimbursable) {
        table.boolean('is_reimbursable').defaultTo(false).after('invoice_id');
      }
    });

    // 2. Safely add the foreign key constraint
    // We use a try-catch for the constraint because if the migration is being re-run
    // after a partial failure, the constraint might (unlikely) already exist.
    try {
      await knex.schema.alterTable('maintenance_costs', (table) => {
        table
          .foreign('invoice_id')
          .references('rent_invoices.invoice_id')
          .onDelete('SET NULL');
      });
    } catch (e) {
      console.log(
        '[Migration] Note: Foreign key on maintenance_costs.invoice_id could not be added (likely already exists).'
      );
    }

    console.log('[Migration] Hardened maintenance_costs schema.');
  }
};

export const down = async (knex) => {
  if (await knex.schema.hasTable('maintenance_costs')) {
    await knex.schema.alterTable('maintenance_costs', (table) => {
      table.dropForeign('invoice_id');
      table.dropColumn('invoice_id');
      table.dropColumn('is_reimbursable');
    });
  }
};
