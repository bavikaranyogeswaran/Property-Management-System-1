export const up = async (knex) => {
  // 1. Add 'viewed' to leads.status
  // Note: Standard knex alter column can be tricky with ENUMs in MySQL.
  // We'll use raw SQL to ensure precision.
  await knex.raw(`
    ALTER TABLE leads 
    MODIFY COLUMN status ENUM('interested', 'viewed', 'converted', 'dropped') DEFAULT 'interested'
  `);

  // 2. Harden property_visits
  // Add 'no-show' to status
  await knex.raw(`
    ALTER TABLE property_visits 
    MODIFY COLUMN status ENUM('pending', 'confirmed', 'cancelled', 'completed', 'no-show') DEFAULT 'pending'
  `);

  // 3. Add loose index first to support FK while we drop the unique key
  try {
    const [existing] = await knex.raw(`
      SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'property_visits'
        AND INDEX_NAME = 'idx_unit_visit_time'
    `);
    if (existing.length === 0) {
      await knex.schema.table('property_visits', (table) => {
        table.index(['unit_id', 'scheduled_date'], 'idx_unit_visit_time');
      });
      console.log('[Flow 2] idx_unit_visit_time index added.');
    }
  } catch (err) {
    console.warn('[Flow 2] Could not add loose index:', err.message);
  }

  // 4. Relax Unique Key (Now safe to drop because idx_unit_visit_time exists)
  try {
    const [indexes] = await knex.raw(`
      SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'property_visits'
        AND INDEX_NAME = 'unique_unit_visit'
    `);

    if (indexes.length > 0) {
      await knex.schema.table('property_visits', (table) => {
        table.dropUnique(['unit_id', 'scheduled_date'], 'unique_unit_visit');
      });
      console.log('[Flow 2] Strict unique_unit_visit key dropped.');
    }
  } catch (err) {
    console.warn('[Flow 2] Could not drop unique_unit_visit:', err.message);
  }
};

export const down = async (knex) => {
  // Revert property_visits
  await knex.schema.table('property_visits', (table) => {
    table.dropIndex(['unit_id', 'scheduled_date'], 'idx_unit_visit_time');
    table.unique(['unit_id', 'scheduled_date'], 'unique_unit_visit');
  });

  await knex.raw(`
    ALTER TABLE property_visits 
    MODIFY COLUMN status ENUM('pending', 'confirmed', 'cancelled', 'completed') DEFAULT 'pending'
  `);

  // Revert leads
  await knex.raw(`
    ALTER TABLE leads 
    MODIFY COLUMN status ENUM('interested', 'converted', 'dropped') DEFAULT 'interested'
  `);
};
