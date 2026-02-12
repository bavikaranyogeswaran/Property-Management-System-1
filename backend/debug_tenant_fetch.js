import pool from './config/db.js';
import invoiceModel from './models/invoiceModel.js';

async function check() {
  try {
    console.log('Checking Invoices for Tenant ID 12 (Sam Flint)...');

    // 1. Raw SQL Check
    const [rows] = await pool.query(
      `
            SELECT ri.* 
            FROM rent_invoices ri
            JOIN leases l ON ri.lease_id = l.lease_id
            WHERE l.tenant_id = ? 
        `,
      [12]
    );
    console.log('Raw Query Result Count:', rows.length);
    if (rows.length > 0) console.log('First Invoice:', rows[0]);

    // 2. Model Check
    console.log('Calling invoiceModel.findByTenantId(12)...');
    const modelRows = await invoiceModel.findByTenantId(12);
    console.log('Model Result Count:', modelRows.length);
    if (modelRows.length > 0) console.log('First Invoice:', modelRows[0]);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    process.exit();
  }
}

check();
