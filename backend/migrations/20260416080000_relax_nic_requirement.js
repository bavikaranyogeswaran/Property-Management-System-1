/**
 * Relax NIC Requirement for Tenants
 * =================================
 * Changes the 'nic' column in the 'tenants' table to be NULLABLE.
 * This allows "Ghost Conversions" where an owner converts a lead to a tenant
 * to trigger a deposit invoice BEFORE the tenant has provided their NIC details.
 * The tenant will provide these details later during account setup.
 */

export async function up(knex) {
  // Check if column exists before altering to avoid redundancy or errors
  if (await knex.schema.hasColumn('tenants', 'nic')) {
    await knex.schema.alterTable('tenants', (table) => {
      // Making NIC nullable but keeping it UNIQUE
      table.string('nic', 20).nullable().alter();
    });
    console.log('[Migration] tenants.nic is now nullable.');
  }
}

export async function down(knex) {
  await knex.schema.alterTable('tenants', (table) => {
    // Warning: This may fail if there are existing NULL values
    table.string('nic', 20).notNullable().alter();
  });
}
