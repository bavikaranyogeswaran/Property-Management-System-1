import pool from './config/db.js';

async function debugReceiptData() {
  console.log('--- Debugging Receipt Data ---');
  try {
    const query = `
            SELECT r.receipt_id, r.amount, r.receipt_date, 
                   p.payment_id, p.invoice_id, 
                   i.lease_id, 
                   l.tenant_id
            FROM receipts r 
            LEFT JOIN payments p ON r.payment_id = p.payment_id 
            LEFT JOIN rent_invoices i ON p.invoice_id = i.invoice_id
            LEFT JOIN leases l ON i.lease_id = l.lease_id
            ORDER BY r.receipt_date DESC
        `;

    const [rows] = await pool.query(query);
    console.log(`Total Receipts Found: ${rows.length}`);
    console.log(JSON.stringify(rows, null, 2));

    if (rows.length > 0) {
      const first = rows[0];
      if (!first.tenant_id) {
        console.warn(
          'WARNING: tenant_id is NULL for the receipt. Check payment -> invoice -> lease linkage.'
        );
      } else {
        console.log(`Success: Linkage found. Tenant ID: ${first.tenant_id}`);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

debugReceiptData();
