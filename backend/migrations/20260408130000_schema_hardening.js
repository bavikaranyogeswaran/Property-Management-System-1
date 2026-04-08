/**
 * Schema Hardening Migration
 * ===========================
 * Fixes identified in the database audit:
 * Phase 1: 1NF — Normalize property features from JSON to relational table
 * Phase 2: Redundancy — Centralize image management (keep image_url columns for backward compat, populate from association tables)
 * Phase 3: 3NF — Convert owner_payouts.amount to a STORED GENERATED column
 * Phase 4: Logic — Fix staff_property_assignments unique constraint
 * Phase 5: Auditability — Add unit_rent_history table
 */
export const up = async (knex) => {
  // =============================================
  // PHASE 1: Property Amenities (1NF Fix)
  // =============================================
  const hasAmenities = await knex.schema.hasTable('property_amenities');
  if (!hasAmenities) {
    await knex.raw(`
      CREATE TABLE property_amenities (
        amenity_id INT AUTO_INCREMENT PRIMARY KEY,
        property_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (property_id) REFERENCES properties(property_id) ON DELETE CASCADE,
        UNIQUE KEY unique_property_amenity (property_id, name)
      )
    `);
    await knex.raw(
      'CREATE INDEX idx_amenity_property ON property_amenities(property_id)'
    );

    // Migrate existing JSON features into the new relational table.
    // This reads each property's JSON features array and inserts them as rows.
    const [properties] = await knex.raw(
      'SELECT property_id, features FROM properties WHERE features IS NOT NULL'
    );

    for (const prop of properties) {
      let features = prop.features;
      // Handle both string and already-parsed JSON
      if (typeof features === 'string') {
        try {
          features = JSON.parse(features);
        } catch {
          continue; // Skip if JSON is malformed
        }
      }

      if (Array.isArray(features) && features.length > 0) {
        const uniqueFeatures = [
          ...new Set(features.filter((f) => f && typeof f === 'string')),
        ];
        for (const featureName of uniqueFeatures) {
          try {
            await knex.raw(
              'INSERT IGNORE INTO property_amenities (property_id, name) VALUES (?, ?)',
              [prop.property_id, featureName]
            );
          } catch {
            // Ignore duplicates
          }
        }
      }
    }

    console.log(
      '[Migration] Phase 1: property_amenities table created and data migrated.'
    );
  }

  // =============================================
  // PHASE 2: Image URL Sync (Redundancy Fix)
  // We KEEP the image_url columns for backward compatibility but
  // ensure existing data is mirrored in the association tables.
  // The application code will be updated to read from association tables.
  // =============================================

  // Sync properties.image_url -> property_images (if not already present)
  const [propsWithImages] = await knex.raw(
    'SELECT property_id, image_url FROM properties WHERE image_url IS NOT NULL'
  );
  for (const prop of propsWithImages) {
    const [existing] = await knex.raw(
      'SELECT image_id FROM property_images WHERE property_id = ? AND image_url = ?',
      [prop.property_id, prop.image_url]
    );
    if (existing.length === 0) {
      try {
        await knex.raw(
          'INSERT INTO property_images (property_id, image_url, is_primary, display_order) VALUES (?, ?, TRUE, 0)',
          [prop.property_id, prop.image_url]
        );
      } catch {
        // Ignore duplicate or constraint errors
      }
    }
  }

  // Sync units.image_url -> unit_images (if not already present)
  const [unitsWithImages] = await knex.raw(
    'SELECT unit_id, image_url FROM units WHERE image_url IS NOT NULL'
  );
  for (const unit of unitsWithImages) {
    const [existing] = await knex.raw(
      'SELECT image_id FROM unit_images WHERE unit_id = ? AND image_url = ?',
      [unit.unit_id, unit.image_url]
    );
    if (existing.length === 0) {
      try {
        await knex.raw(
          'INSERT INTO unit_images (unit_id, image_url, is_primary, display_order) VALUES (?, ?, TRUE, 0)',
          [unit.unit_id, unit.image_url]
        );
      } catch {
        // Ignore duplicate or constraint errors
      }
    }
  }

  console.log(
    '[Migration] Phase 2: Image URL data synchronized to association tables.'
  );

  // =============================================
  // PHASE 3: Owner Payouts Generated Column (3NF Fix)
  // Convert `amount` from a manually-set BIGINT to a STORED GENERATED column.
  // STORED (not VIRTUAL) so it's persisted and can be indexed/used in ORDER BY.
  // =============================================
  try {
    // Check if the column is already a generated column
    const [colInfo] = await knex.raw(
      "SELECT GENERATION_EXPRESSION FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'owner_payouts' AND COLUMN_NAME = 'amount'"
    );
    const isAlreadyGenerated =
      colInfo[0]?.GENERATION_EXPRESSION &&
      colInfo[0].GENERATION_EXPRESSION.length > 0;

    if (!isAlreadyGenerated) {
      await knex.raw(
        'ALTER TABLE owner_payouts MODIFY COLUMN amount BIGINT AS (gross_amount - commission_amount - expenses_amount) STORED'
      );
      console.log(
        '[Migration] Phase 3: owner_payouts.amount converted to STORED GENERATED column.'
      );
    }
  } catch (err) {
    console.warn(
      '[Migration] Phase 3 warning: Could not convert amount to generated column.',
      err.message
    );
  }

  // =============================================
  // PHASE 4: Staff Property Assignments (Logic Fix)
  // Remove UNIQUE(property_id) and add UNIQUE(user_id, property_id)
  // =============================================
  try {
    // Drop the restrictive unique key on property_id alone
    const [existingKeys] = await knex.raw(
      "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_property_assignments' AND CONSTRAINT_NAME = 'unique_property'"
    );
    if (existingKeys.length > 0) {
      await knex.raw(
        'ALTER TABLE staff_property_assignments DROP INDEX unique_property'
      );
    }

    // Add the correct composite unique key
    const [newKeys] = await knex.raw(
      "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_property_assignments' AND CONSTRAINT_NAME = 'unique_staff_property'"
    );
    if (newKeys.length === 0) {
      await knex.raw(
        'ALTER TABLE staff_property_assignments ADD UNIQUE KEY unique_staff_property (user_id, property_id)'
      );
    }

    console.log(
      '[Migration] Phase 4: staff_property_assignments unique key fixed.'
    );
  } catch (err) {
    console.warn('[Migration] Phase 4 warning:', err.message);
  }

  // =============================================
  // PHASE 5: Unit Rent History (Auditability)
  // =============================================
  const hasRentHistory = await knex.schema.hasTable('unit_rent_history');
  if (!hasRentHistory) {
    await knex.raw(`
      CREATE TABLE unit_rent_history (
        history_id INT AUTO_INCREMENT PRIMARY KEY,
        unit_id INT NOT NULL,
        previous_rent BIGINT NOT NULL,
        new_rent BIGINT NOT NULL,
        changed_by INT,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE,
        FOREIGN KEY (changed_by) REFERENCES users(user_id) ON DELETE SET NULL
      )
    `);
    await knex.raw(
      'CREATE INDEX idx_rent_history_unit ON unit_rent_history(unit_id)'
    );

    console.log('[Migration] Phase 5: unit_rent_history table created.');
  }
};

export const down = async (knex) => {
  // Reverse Phase 5
  await knex.schema.dropTableIfExists('unit_rent_history');

  // Reverse Phase 4 — Restore original constraint
  try {
    const [newKeys] = await knex.raw(
      "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_property_assignments' AND CONSTRAINT_NAME = 'unique_staff_property'"
    );
    if (newKeys.length > 0) {
      await knex.raw(
        'ALTER TABLE staff_property_assignments DROP INDEX unique_staff_property'
      );
    }

    const [oldKeys] = await knex.raw(
      "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_property_assignments' AND CONSTRAINT_NAME = 'unique_property'"
    );
    if (oldKeys.length === 0) {
      await knex.raw(
        'ALTER TABLE staff_property_assignments ADD UNIQUE KEY unique_property (property_id)'
      );
    }
  } catch (err) {
    console.warn('[Rollback] Phase 4:', err.message);
  }

  // Reverse Phase 3 — Convert back to regular column
  try {
    const [colInfo] = await knex.raw(
      "SELECT GENERATION_EXPRESSION FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'owner_payouts' AND COLUMN_NAME = 'amount'"
    );
    const isGenerated =
      colInfo[0]?.GENERATION_EXPRESSION &&
      colInfo[0].GENERATION_EXPRESSION.length > 0;

    if (isGenerated) {
      await knex.raw(
        'ALTER TABLE owner_payouts MODIFY COLUMN amount BIGINT NOT NULL'
      );
    }
  } catch (err) {
    console.warn('[Rollback] Phase 3:', err.message);
  }

  // Reverse Phase 1
  await knex.schema.dropTableIfExists('property_amenities');
};
