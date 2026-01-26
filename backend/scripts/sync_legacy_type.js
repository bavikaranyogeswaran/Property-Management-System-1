import db from '../config/db.js';

async function syncTypeColumn() {
    try {
        console.log('Syncing legacy `type` column from `property_types`...');

        const query = `
            UPDATE properties p
            JOIN property_types pt ON p.property_type_id = pt.type_id
            SET p.type = pt.name
        `;

        const [result] = await db.query(query);
        console.log(`Synced ${result.affectedRows} properties.`);

        process.exit(0);
    } catch (err) {
        console.error('Sync failed:', err);
        process.exit(1);
    }
}

syncTypeColumn();
