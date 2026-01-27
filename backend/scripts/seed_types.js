
import db from '../config/db.js';

const seedTypes = async () => {
    try {
        console.log('Seeding Types...');

        // Property Types
        const pTypes = ['Apartment', 'House', 'Commercial', 'Villa', 'Studio'];
        for (const name of pTypes) {
            await db.query(`INSERT IGNORE INTO property_types (name) VALUES (?)`, [name]);
        }
        console.log('Property types seeded.');

        // Unit Types
        const uTypes = ['1BHK', '2BHK', '3BHK', 'Studio', 'Penthouse', 'Office Space', 'Shop'];
        for (const name of uTypes) {
            await db.query(`INSERT IGNORE INTO unit_types (name) VALUES (?)`, [name]);
        }
        console.log('Unit types seeded.');

    } catch (error) {
        console.error('Error seeding types:', error);
    } finally {
        process.exit();
    }
};

seedTypes();
