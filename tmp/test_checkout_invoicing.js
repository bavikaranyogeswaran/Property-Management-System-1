const db = require('../backend/config/db');
// Since db.js uses 'export default pool.promise()', in CJS it will be in the .default property
const pool = db.default || db; 

const maintenanceService = require('../backend/services/maintenanceService');
const maintenanceRequestModel = require('../backend/models/maintenanceRequestModel');

async function runTest() {
    console.log('\n--- Testing Checkout Invoicing (Grace Period) ---');
    
    try {
        if (!pool || typeof pool.query !== 'function') {
            throw new Error('Database pool not properly initialized. Check if db.js export is compatible with require().');
        }

        // 1. Setup mock data
        const [tenants] = await pool.query('SELECT id FROM users WHERE role = "tenant" LIMIT 1');
        const [units] = await pool.query('SELECT id FROM units LIMIT 1');
        
        if (tenants.length === 0 || units.length === 0) {
            console.error('Insufficient data for test (need at least one tenant and one unit)');
            return;
        }
        
        const tenantId = tenants[0].id;
        const unitId = units[0].id;
        
        // 2. Create an EXPIRED lease (ended 5 days ago)
        const fiveDaysAgo = new Date();
        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);
        
        const [result] = await pool.query(
            "INSERT INTO leases (tenant_id, unit_id, start_date, end_date, monthly_rent, security_deposit, status, is_documents_verified, verification_status) VALUES (?, ?, ?, ?, 50000, 100000, 'expired', 1, 'verified')",
            [tenantId, unitId, startDate.toISOString().split('T')[0], fiveDaysAgo.toISOString().split('T')[0]]
        );
        const leaseId = result.insertId;
        console.log(`Created expired lease #${leaseId} ending on ${fiveDaysAgo.toISOString().split('T')[0]}`);
        
        // 3. Create a maintenance request for this unit/tenant
        const requestId = await maintenanceRequestModel.create({
            tenantId,
            unitId,
            title: 'Move-out Damage Test',
            description: 'Wall paint damaged during move-out',
            category: 'structural',
            priority: 'medium'
        });
        console.log(`Created maintenance request #${requestId}`);
        
        // 4. Record a cost
        const ownerUser = { role: 'owner', id: 1 }; 
        const costId = await maintenanceService.recordCost({
            requestId,
            amount: 7500,
            description: 'Painting supplies',
            recordedDate: new Date().toISOString().split('T')[0]
        }, ownerUser);
        console.log(`Recorded cost #${costId}`);
        
        // 5. Attempt to Create Invoice (The actual fix test)
        console.log('Attempting to create invoice for EXPIRED lease...');
        const invoiceId = await maintenanceService.createInvoice({
            requestId,
            amount: 7500,
            description: 'Wall Damage Billing',
            costId: costId
        }, ownerUser);
        
        console.log(`SUCCESS: Created invoice #${invoiceId} for expired lease!`);
        
        // 6. Test duplicate description handling
        console.log('Testing duplicate description handling...');
        const secondCostId = await maintenanceService.recordCost({
            requestId,
            amount: 2500,
            description: 'Labor',
            recordedDate: new Date().toISOString().split('T')[0]
        }, ownerUser);
        
        const secondInvoiceId = await maintenanceService.createInvoice({
            requestId,
            amount: 2500,
            description: 'Wall Damage Billing', // Same description as before
            costId: secondCostId
        }, ownerUser);
        
        console.log(`SUCCESS: Created second invoice #${secondInvoiceId} with duplicate base description!`);
        
        // Cleanup
        await pool.query('DELETE FROM invoices WHERE id IN (?, ?)', [invoiceId, secondInvoiceId]);
        await pool.query('DELETE FROM maintenance_costs WHERE cost_id IN (?, ?)', [costId, secondCostId]);
        await pool.query('DELETE FROM maintenance_requests WHERE id = ?', [requestId]);
        await pool.query('DELETE FROM leases WHERE id = ?', [leaseId]);
        console.log('Cleanup completed.');
        
    } catch (error) {
        console.error('TEST FAILED:', error.message);
    } finally {
        if (pool && typeof pool.end === 'function') {
            // await pool.end(); // Don't end it if we're using a shared pool in a long-running context, but okay here.
        }
    }
}

runTest().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
