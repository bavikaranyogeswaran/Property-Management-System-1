/**
 * Add Lease Escalation Columns (Feature E5)
 * =========================================
 * Adds missing columns for automated rent escalation to the 'leases' table.
 * Specifically: escalation_percentage, escalation_period_months, and last_escalation_date.
 */

export async function up(knex) {
  await knex.schema.alterTable('leases', (table) => {
    table
      .decimal('escalation_percentage', 5, 2)
      .nullable()
      .defaultTo(null)
      .after('monthly_rent');
    table
      .integer('escalation_period_months')
      .defaultTo(12)
      .after('escalation_percentage');
    table
      .date('last_escalation_date')
      .nullable()
      .defaultTo(null)
      .after('escalation_period_months');
  });
  console.log('[Migration] Lease escalation columns added.');
}

export async function down(knex) {
  await knex.schema.alterTable('leases', (table) => {
    table.dropColumn('escalation_percentage');
    table.dropColumn('escalation_period_months');
    table.dropColumn('last_escalation_date');
  });
}
