export const up = async (knex) => {
  console.log('[Migration] Rescuing rent_invoices unique key hardening...');

  // 1. Identify and delete duplicates before applying the strict constraint.
  // We keep the oldest invoice (lowest invoice_id) for each period.
  await knex.raw(`
    DELETE FROM rent_invoices 
    WHERE invoice_id NOT IN (
      SELECT MIN(invoice_id)
      FROM (SELECT * FROM rent_invoices) AS ri
      GROUP BY lease_id, year, month, invoice_type
    )
  `);

  // 2. Safely swap the unique key.
  const [existingIndex] = await knex.raw(`
    SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'rent_invoices'
      AND INDEX_NAME = 'unique_periodic_invoice'
  `);

  if (existingIndex.length > 0) {
    // Add temp index to support foreign keys if needed
    const [tempIndex] = await knex.raw(`
      SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'rent_invoices'
        AND INDEX_NAME = 'temp_idx_lease_id'
    `);

    if (tempIndex.length === 0) {
      await knex.raw(
        'ALTER TABLE rent_invoices ADD INDEX temp_idx_lease_id (lease_id)'
      );
    }
    await knex.raw(
      'ALTER TABLE rent_invoices DROP INDEX unique_periodic_invoice'
    );
    await knex.raw(
      'ALTER TABLE rent_invoices ADD UNIQUE KEY unique_periodic_invoice (lease_id, year, month, invoice_type)'
    );
    await knex.raw('ALTER TABLE rent_invoices DROP INDEX temp_idx_lease_id');
  } else {
    await knex.raw(
      'ALTER TABLE rent_invoices ADD UNIQUE KEY unique_periodic_invoice (lease_id, year, month, invoice_type)'
    );
  }

  console.log(
    '[Migration] rent_invoices unique key successfully hardened (lease_id, year, month, invoice_type).'
  );
};

export const down = async (knex) => {
  // Revert to multi-column index if absolutely necessary
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
};
