import db from '../config/db.js';

async function cleanupDuplicates() {
  console.log('[Cleanup] Searching for duplicate rent invoices...');

  const [duplicates] = await db.query(`
        SELECT lease_id, year, month, invoice_type, COUNT(*) as count
        FROM rent_invoices
        GROUP BY lease_id, year, month, invoice_type
        HAVING count > 1
    `);

  console.log(`[Cleanup] Found ${duplicates.length} sets of duplicates.`);

  for (const dup of duplicates) {
    console.log(
      `[Cleanup] Cleaning duplicates for Lease ${dup.lease_id}, Period ${dup.year}-${dup.month} (${dup.invoice_type})`
    );

    // Find all invoices for this set
    const [rows] = await db.query(
      `
            SELECT invoice_id FROM rent_invoices
            WHERE lease_id = ? AND year = ? AND month = ? AND invoice_type = ?
            ORDER BY created_at DESC
        `,
      [dup.lease_id, dup.year, dup.month, dup.invoice_type]
    );

    // Keep the first (most recent), delete the rest
    const toKeep = rows[0].invoice_id;
    const toDelete = rows.slice(1).map((r) => r.invoice_id);

    console.log(
      `[Cleanup] Keeping ID ${toKeep}, Deleting IDs: ${toDelete.join(', ')}`
    );

    // Check if any payments are linked to the ones being deleted
    const [linkedPayments] = await db.query(
      `
            SELECT payment_id FROM payments WHERE invoice_id IN (?)
        `,
      [toDelete]
    );

    if (linkedPayments.length > 0) {
      console.warn(
        `[Cleanup] WARNING: Payments are linked to duplicate invoices ${toDelete.join(', ')}. Re-linking them to ${toKeep}.`
      );
      await db.query(
        `
                UPDATE payments SET invoice_id = ? WHERE invoice_id IN (?)
            `,
        [toKeep, toDelete]
      );
    }

    // Re-link accounting ledger entries
    const [linkedLedger] = await db.query(
      `
            SELECT entry_id FROM accounting_ledger WHERE invoice_id IN (?)
        `,
      [toDelete]
    );

    if (linkedLedger.length > 0) {
      console.warn(
        `[Cleanup] WARNING: Ledger entries are linked to duplicate invoices ${toDelete.join(', ')}. Re-linking them to ${toKeep}.`
      );
      await db.query(
        `
                UPDATE accounting_ledger SET invoice_id = ? WHERE invoice_id IN (?)
            `,
        [toKeep, toDelete]
      );
    }

    await db.query(
      `
            DELETE FROM rent_invoices WHERE invoice_id IN (?)
        `,
      [toDelete]
    );
  }

  console.log('[Cleanup] Cleanup complete.');
  process.exit(0);
}

cleanupDuplicates();
