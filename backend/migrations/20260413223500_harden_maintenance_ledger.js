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

    if (!hasInvoiceId || !hasIsReimbursable) {
      await knex.schema.alterTable('maintenance_costs', (table) => {
        if (!hasInvoiceId) {
          table
            .integer('invoice_id')
            .unsigned()
            .nullable()
            .after('recorded_date');
          table
            .foreign('invoice_id')
            .references('rent_invoices.invoice_id')
            .onDelete('SET NULL');
        }
        if (!hasIsReimbursable) {
          table.boolean('is_reimbursable').defaultTo(false).after('invoice_id');
        }
      });

      console.log('[Migration] Added necessary columns to maintenance_costs.');
    }
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
