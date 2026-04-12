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
    // We must add a temporary index on lease_id because MySQL won't let us drop
    // unique_periodic_invoice if it's the only index supporting the lease_id foreign key.
    await knex.raw(
      'ALTER TABLE rent_invoices ADD INDEX temp_idx_lease_id (lease_id)'
    );

    await knex.raw(
      'ALTER TABLE rent_invoices DROP INDEX unique_periodic_invoice'
    );

    await knex.raw(
      'ALTER TABLE rent_invoices ADD UNIQUE KEY unique_periodic_invoice (lease_id, year, month, invoice_type)'
    );

    // Now safe to remove the temporary index
    await knex.raw('ALTER TABLE rent_invoices DROP INDEX temp_idx_lease_id');
  } else {
    await knex.raw(
      'ALTER TABLE rent_invoices ADD UNIQUE KEY unique_periodic_invoice (lease_id, year, month, invoice_type)'
    );
  }
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
    // Temporary index to support FK while swapping unique key back
    await knex.raw(
      'ALTER TABLE rent_invoices ADD INDEX temp_idx_lease_id (lease_id)'
    );

    await knex.raw(
      'ALTER TABLE rent_invoices DROP INDEX unique_periodic_invoice'
    );

    await knex.raw(
      'ALTER TABLE rent_invoices ADD UNIQUE KEY unique_periodic_invoice (lease_id, year, month, invoice_type, due_date, description(64))'
    );

    await knex.raw('ALTER TABLE rent_invoices DROP INDEX temp_idx_lease_id');
  } else {
    await knex.raw(
      'ALTER TABLE rent_invoices ADD UNIQUE KEY unique_periodic_invoice (lease_id, year, month, invoice_type, due_date, description(64))'
    );
  }
};
