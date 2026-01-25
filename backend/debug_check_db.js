import db from './config/db.js';

async function checkProperties() {
    try {
        const [rows] = await db.query('SELECT property_id, name, image_url, address FROM properties');
        console.log('--- Properties in DB ---');
        console.table(rows);

        const [images] = await db.query('SELECT * FROM property_images');
        console.log('--- Property Images in DB ---');
        console.table(images);

        process.exit(0);
    } catch (error) {
        console.error('Error fetching properties:', error);
        process.exit(1);
    }
}

checkProperties();
