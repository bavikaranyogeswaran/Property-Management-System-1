import pool from './config/db.js';

async function debugFullChain() {
  console.log('--- Debugging Full Receipt Chain ---');
  try {
    const query = `
            SELECT 
                r.receipt_id, 
                r.payment_id as r_payment_id,
                p.payment_id as p_payment_id,
                p.invoice_id as p_invoice_id,
                i.invoice_id as i_invoice_id,
                i.lease_id as i_lease_id,
                l.lease_id as l_lease_id,
                l.tenant_id as l_tenant_id
            FROM receipts r 
            LEFT JOIN payments p ON r.payment_id = p.payment_id 
            LEFT JOIN rent_invoices i ON p.invoice_id = i.invoice_id
            LEFT JOIN leases l ON i.lease_id = l.lease_id
        `;

    const [rows] = await pool.query(query);
    console.log(`Total Receipts: ${rows.length}`);

    if (rows.length === 0) {
      console.log('No receipts found.');
    } else {
      console.table(rows);
      rows.forEach((row, index) => {
        if (!row.l_tenant_id) {
          console.log(`\n[Receipt ${row.receipt_id}] BROKEN LINK:`);
          if (!row.p_payment_id)
            console.log(
              '  -> Missing Payment (r.payment_id matching p.payment_id)'
            );
          else if (!row.i_invoice_id)
            console.log(
              `  -> Missing Invoice (p.invoice_id: ${row.p_invoice_id})`
            );
          else if (!row.l_lease_id)
            console.log(`  -> Missing Lease (i.lease_id: ${row.i_lease_id})`);
          else
            console.log(
              `  -> Missing Tenant (l.tenant_id is NULL in lease ${row.l_lease_id})`
            );
        } else {
          console.log(
            `\n[Receipt ${row.receipt_id}] OK. Tenant ID: ${row.l_tenant_id}`
          );
        }
      });
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

debugFullChain();
