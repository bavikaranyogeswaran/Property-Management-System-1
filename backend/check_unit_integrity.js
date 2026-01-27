
import pool from './config/db.js';

async function checkDataIntegrity() {
    try {
        console.log('Checking for units with missing unit_type_id...');
        const [rows] = await pool.query('SELECT unit_id, unit_number, unit_type, unit_type_id FROM units WHERE unit_type_id IS NULL');

        if (rows.length > 0) {
            console.log(`Found ${rows.length} units with missing unit_type_id:`);
            console.table(rows);
        } else {
            console.log('All units have unit_type_id set.');
        }

        console.log('\nChecking for inconsistency between unit_type string and unit_type_id relation...');
        const [inconsistent] = await pool.query(`
            SELECT u.unit_id, u.unit_number, u.unit_type as string_val, ut.name as relation_val 
            FROM units u 
            JOIN unit_types ut ON u.unit_type_id = ut.type_id 
            WHERE u.unit_type != ut.name
        `);

        if (inconsistent.length > 0) {
            console.log(`Found ${inconsistent.length} inconsistencies:`);
            console.table(inconsistent);
        } else {
            console.log('Data is consistent.');
        }

    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
checkDataIntegrity();
