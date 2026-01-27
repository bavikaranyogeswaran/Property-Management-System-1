import db from '../config/db.js';

async function fixOrphanedUnitReferences() {
    try {
        console.log('Checking for orphaned unit references in leads table...');

        // Find leads with invalid unit_id references
        const [orphanedLeads] = await db.query(`
            SELECT l.lead_id, l.unit_id, l.name 
            FROM leads l
            LEFT JOIN units u ON l.unit_id = u.unit_id
            WHERE l.unit_id IS NOT NULL AND u.unit_id IS NULL
        `);

        if (orphanedLeads.length === 0) {
            console.log('✅ No orphaned unit references found.');
            return;
        }

        console.log(`Found ${orphanedLeads.length} orphaned unit reference(s):`);
        console.table(orphanedLeads);

        // Fix by setting unit_id to NULL
        const [result] = await db.query(`
            UPDATE leads l
            LEFT JOIN units u ON l.unit_id = u.unit_id
            SET l.unit_id = NULL
            WHERE l.unit_id IS NOT NULL AND u.unit_id IS NULL
        `);

        console.log(`✅ Fixed ${result.affectedRows} orphaned unit reference(s).`);
        console.log('Updated leads now have unit_id set to NULL (general property interest).');

    } catch (e) {
        console.error('❌ Error:', e);
    } finally {
        process.exit();
    }
}

fixOrphanedUnitReferences();
