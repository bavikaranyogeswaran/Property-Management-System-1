/**
 * HARDEN PAYMENT REFERENCES
 *
 * 1. Backfills legacy payments with missing reference numbers.
 * 2. Sets reference_number to NOT NULL.
 */
export async function up(knex) {
  // 1. Backfill NULL reference_numbers with a legacy prefix to satisfy UNIQUE constraint once non-null
  // We use the ID to ensure uniqueness.
  await knex.raw(`
        UPDATE payments 
        SET reference_number = CONCAT('LEGACY-REF-', payment_id) 
        WHERE reference_number IS NULL
    `);

  // 2. Modify column to NOT NULL
  await knex.schema.alterTable('payments', (table) => {
    table.string('reference_number', 100).notNullable().alter();
  });
}

export async function down(knex) {
  // Revert NOT NULL
  await knex.schema.alterTable('payments', (table) => {
    table.string('reference_number', 100).nullable().alter();
  });
}
