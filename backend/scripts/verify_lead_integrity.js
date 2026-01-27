import db from '../config/db.js';

async function verifyLeadIntegrity() {
    try {
        console.log('Verifying lead-unit-property relationships...\n');

        const [results] = await db.query(`
            SELECT 
                l.lead_id,
                l.name as lead_name,
                l.property_id,
                p.name as property_name,
                l.unit_id,
                u.unit_number,
                u.property_id as unit_property_id,
                CASE 
                    WHEN l.unit_id IS NULL THEN '✅ General property interest'
                    WHEN u.unit_id IS NULL THEN '❌ Invalid unit reference'
                    WHEN l.property_id != u.property_id THEN '⚠️  Unit belongs to different property'
                    ELSE '✅ Valid unit reference'
                END as validation_status
            FROM leads l
            LEFT JOIN properties p ON l.property_id = p.property_id
            LEFT JOIN units u ON l.unit_id = u.unit_id
            ORDER BY l.lead_id
        `);

        console.table(results);

        const issues = results.filter(r => r.validation_status.includes('❌') || r.validation_status.includes('⚠️'));

        if (issues.length === 0) {
            console.log('\n✅ All lead references are valid!');
        } else {
            console.log(`\n⚠️  Found ${issues.length} data integrity issue(s):`);
            console.table(issues);
        }

    } catch (e) {
        console.error('❌ Error:', e);
    } finally {
        process.exit();
    }
}

verifyLeadIntegrity();
