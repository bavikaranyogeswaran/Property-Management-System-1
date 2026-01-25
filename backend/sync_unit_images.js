import db from './config/db.js';

async function syncUnitImages() {
    try {
        console.log('Starting unit image sync...');

        // Get all units
        const [units] = await db.query('SELECT unit_id FROM units');

        let updatedCount = 0;

        for (const unit of units) {
            // Find primary image for this unit
            const [images] = await db.query(
                'SELECT image_url FROM unit_images WHERE unit_id = ? AND is_primary = TRUE LIMIT 1',
                [unit.unit_id]
            );

            if (images.length > 0) {
                const primaryUrl = images[0].image_url;
                await db.query(
                    'UPDATE units SET image_url = ? WHERE unit_id = ?',
                    [primaryUrl, unit.unit_id]
                );
                console.log(`Updated unit ${unit.unit_id} with image ${primaryUrl}`);
                updatedCount++;
            } else {
                // Fallback: If no primary, use the first image available
                const [anyImage] = await db.query(
                    'SELECT image_url FROM unit_images WHERE unit_id = ? ORDER BY created_at ASC LIMIT 1',
                    [unit.unit_id]
                );
                if (anyImage.length > 0) {
                    const firstUrl = anyImage[0].image_url;
                    await db.query(
                        'UPDATE units SET image_url = ? WHERE unit_id = ?',
                        [firstUrl, unit.unit_id]
                    );
                    console.log(`Updated unit ${unit.unit_id} with first available image ${firstUrl}`);
                    updatedCount++;
                }
            }
        }

        console.log(`Sync complete. Updated ${updatedCount} units.`);
        process.exit(0);
    } catch (error) {
        console.error('Sync failed:', error);
        process.exit(1);
    }
}

syncUnitImages();
