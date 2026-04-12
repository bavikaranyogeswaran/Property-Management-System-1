export const up = async (knex) => {
  console.log(
    '[Migration] Hardening rent_invoices unique key to prevent duplicate period generation.'
  );

  // We revert the unique key to strictly (lease_id, year, month, invoice_type).
  // This ensures that even if a treasurer changes the due date or description during a retry,
  // the system will strictly block duplicate rent invoices for the same lease/month.
  await knex.raw(
    'ALTER TABLE rent_invoices DROP INDEX IF EXISTS unique_periodic_invoice'
  );

  await knex.raw(
    'ALTER TABLE rent_invoices ADD UNIQUE KEY unique_periodic_invoice (lease_id, year, month, invoice_type)'
  );
};

export const down = async (knex) => {
  // Revert to the less strict version if needed (includes due_date and description)
  await knex.raw(
    'ALTER TABLE rent_invoices DROP INDEX IF EXISTS unique_periodic_invoice'
  );

  await knex.raw(
    'ALTER TABLE rent_invoices ADD UNIQUE KEY unique_periodic_invoice (lease_id, year, month, invoice_type, due_date, description(64))'
  );
};