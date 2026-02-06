import pool from './config/db.js';

async function check() {
    try {
        console.log('Checking Invoice ID 3...');

        const [invoices] = await pool.query("SELECT * FROM rent_invoices WHERE invoice_id = 3");
        if (invoices.length === 0) { console.log("Invoice 3 not found"); process.exit(); }

        const inv = invoices[0];
        console.log('--- INVOICE ---');
        console.log(`ID: ${inv.invoice_id}`);
        console.log(`Amount: ${inv.amount}`);
        console.log(`Due Date (Raw):`, inv.due_date);
        console.log(`Status: ${inv.status}`);
        console.log(`Generated:`, inv.created_at); // Assuming created_at exists, schema check needed? 
        // If created_at not in schema, generated date is implicit? 
        // Screenshot said "Generated 2026 02 06".

        console.log('\n--- LEASE ---');
        const [leases] = await pool.query("SELECT * FROM leases WHERE lease_id = ?", [inv.lease_id]);
        if (leases.length === 0) { console.log("Lease not found"); }
        else {
            const lease = leases[0];
            console.log(`ID: ${lease.lease_id}`);
            console.log(`Start Date (Raw):`, lease.start_date);
            console.log(`End Date (Raw):`, lease.end_date);
            console.log(`Monthly Rent: ${lease.monthly_rent}`);
        }

    } catch (e) {
        console.error("Error:", e);
    } finally {
        process.exit();
    }
}

check();
