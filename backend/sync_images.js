import db from './config/db.js';

async function syncImages() {
    try {
        console.log('Starting image sync...');

        // Get all properties
        const [properties] = await db.query('SELECT property_id FROM properties');

        let updatedCount = 0;

        for (const prop of properties) {
            // Find primary image for this property
            const [images] = await db.query(
                'SELECT image_url FROM property_images WHERE property_id = ? AND is_primary = TRUE LIMIT 1',
                [prop.property_id]
            );

            if (images.length > 0) {
                const primaryUrl = images[0].image_url;
                await db.query(
                    'UPDATE properties SET image_url = ? WHERE property_id = ?',
                    [primaryUrl, prop.property_id]
                );
                console.log(`Updated property ${prop.property_id} with image ${primaryUrl}`);
                updatedCount++;
            } else {
                // Fallback: If no primary, use the first image available
                const [anyImage] = await db.query(
                    'SELECT image_url FROM property_images WHERE property_id = ? ORDER BY created_at ASC LIMIT 1',
                    [prop.property_id]
                );
                if (anyImage.length > 0) {
                    const firstUrl = anyImage[0].image_url;
                    await db.query(
                        'UPDATE properties SET image_url = ? WHERE property_id = ?',
                        [firstUrl, prop.property_id]
                    );
                    console.log(`Updated property ${prop.property_id} with first available image ${firstUrl}`);
                    updatedCount++;
                }
            }
        }

        console.log(`Sync complete. Updated ${updatedCount} properties.`);
        process.exit(0);
    } catch (error) {
        console.error('Sync failed:', error);
        process.exit(1);
    }
}

syncImages();
