import db from '../config/db.js';

async function normalizeDatabase() {
    try {
        console.log('Starting 3NF Normalization...');

        // Helper to drop foreign key if exists
        const dropForeignKey = async (tableName, columnName) => {
            try {
                // Find constraint name
                const [rows] = await db.query(`
                    SELECT CONSTRAINT_NAME 
                    FROM information_schema.KEY_COLUMN_USAGE 
                    WHERE TABLE_SCHEMA = DATABASE() 
                    AND TABLE_NAME = ? 
                    AND COLUMN_NAME = ? 
                    AND REFERENCED_TABLE_NAME IS NOT NULL
                `, [tableName, columnName]);

                for (const row of rows) {
                    console.log(`Dropping FK ${row.CONSTRAINT_NAME} on ${tableName}.${columnName}...`);
                    await db.query(`ALTER TABLE ${tableName} DROP FOREIGN KEY ${row.CONSTRAINT_NAME}`);
                }
            } catch (e) {
                console.log(`Error checking/dropping FK for ${tableName}.${columnName}:`, e.message);
            }
        };

        // 1. Properties: Drop 'type'
        console.log('Dropping legacy properties.type column...');
        try {
            await db.query(`ALTER TABLE properties DROP COLUMN type`);
        } catch (e) {
            console.log('Error dropping properties.type (maybe already dropped):', e.message);
        }

        // 2. Rent Invoices: Drop tenant_id, unit_id
        await dropForeignKey('rent_invoices', 'tenant_id');
        await dropForeignKey('rent_invoices', 'unit_id');
        console.log('Dropping rent_invoices columns...');
        try {
            await db.query(`ALTER TABLE rent_invoices DROP COLUMN tenant_id, DROP COLUMN unit_id`);
        } catch (e) { console.log(e.message); }

        // 3. Payments: Drop tenant_id
        await dropForeignKey('payments', 'tenant_id');
        console.log('Dropping payments.tenant_id...');
        try {
            await db.query(`ALTER TABLE payments DROP COLUMN tenant_id`);
        } catch (e) { console.log(e.message); }

        // 4. Receipts: Drop tenant_id
        await dropForeignKey('receipts', 'tenant_id');
        console.log('Dropping receipts.tenant_id...');
        try {
            await db.query(`ALTER TABLE receipts DROP COLUMN tenant_id`);
        } catch (e) { console.log(e.message); }

        console.log('Normalization complete.');
        process.exit(0);
    } catch (err) {
        console.error('Normalization failed:', err);
        process.exit(1);
    }
}

normalizeDatabase();
