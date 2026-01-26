import db from './config/db.js';

async function migrate() {
    try {
        console.log('Starting migration: Removing "negotiation" status...');

        // 1. Update existing leads with 'negotiation' status to 'interested'
        console.log('Updating existing "negotiation" leads to "interested"...');
        const [updateResult] = await db.query(`
            UPDATE leads 
            SET status = 'interested' 
            WHERE status = 'negotiation'
        `);
        console.log(`Updated ${updateResult.affectedRows} leads.`);

        // 2. Alter the ENUM definition to remove 'negotiation'
        // We need to redefine the column without 'negotiation'
        console.log('Altering leads table to remove "negotiation" from ENUM...');
        await db.query(`
            ALTER TABLE leads
            MODIFY COLUMN status ENUM('interested', 'converted', 'dropped') DEFAULT 'interested'
        `);

        console.log('Migration successful: "negotiation" status removed.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
