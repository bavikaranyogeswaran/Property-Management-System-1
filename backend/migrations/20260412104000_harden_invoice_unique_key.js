export const up = async (knex) => {
  console.log(
    '[Migration] Hardening rent_invoices unique key to prevent duplicate period generation.'
  );

  // We revert the unique key to strictly (lease_id, year, month, invoice_type).
  // This ensures that even if a treasurer changes the due date or description during a retry,
  // the system will strictly block duplicate rent invoices for the same lease/month.

  // Safe Index Drop: Manual existence check for compatibility with MySQL < 8.0.30
  const [existingIndex] = await knex.raw(`
    SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'rent_invoices'
      AND INDEX_NAME = 'unique_periodic_invoice'
  `);

  if (existingIndex.length > 0) {
    await knex.raw(
      'ALTER TABLE rent_invoices DROP INDEX unique_periodic_invoice'
    );
  }

  await knex.raw(
    'ALTER TABLE rent_invoices ADD UNIQUE KEY unique_periodic_invoice (lease_id, year, month, invoice_type)'
  );
};

export const down = async (knex) => {
  // Revert to the less strict version if needed (includes due_date and description)
  const [existingIndex] = await knex.raw(`
    SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'rent_invoices'
      AND INDEX_NAME = 'unique_periodic_invoice'
  `);

  if (existingIndex.length > 0) {
    await knex.raw(
      'ALTER TABLE rent_invoices DROP INDEX unique_periodic_invoice'
    );
  }

  await knex.raw(
    'ALTER TABLE rent_invoices ADD UNIQUE KEY unique_periodic_invoice (lease_id, year, month, invoice_type, due_date, description(64))'
  );
};
