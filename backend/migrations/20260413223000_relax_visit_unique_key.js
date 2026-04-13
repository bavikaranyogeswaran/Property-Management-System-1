export const up = async (knex) => {
  // Drop the exact-match unique key on property_visits
  // We're moving logic to the application layer to support 30-min buffer windows.
  const [existingIndex] = await knex.raw(`
    SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'property_visits'
      AND INDEX_NAME = 'unique_unit_visit'
  `);

  if (existingIndex.length > 0) {
    await knex.raw('ALTER TABLE property_visits DROP INDEX unique_unit_visit');
    console.log('[Migration] Dropped unique_unit_visit exact-match index.');
  }
};

export const down = async (knex) => {
  // Revert to the strict unique key if necessary
  // Note: This might fail if the data now contains proximity overlaps.
  await knex.raw(
    'ALTER TABLE property_visits ADD UNIQUE KEY unique_unit_visit (unit_id, scheduled_date)'
  );
};
