/**
 * Priority 2 & Data Safety Extension: Data Integrity & Structural Safety (G2, I3)
 *
 * - G2: Leads email and Owners NIC made NOT NULL.
 * - I3: owners_id foreign key on properties changed from CASCADE to RESTRICT to avoid catastrophic mass deletions.
 */

export async function up(knex) {
  // G2: Identity Guardrails (Leads)
  // Fill null emails with random placeholder to avoid constraint violation on existing data
  await knex.raw(
    `UPDATE leads SET email = CONCAT('placeholder_', lead_id, '@system.local') WHERE email IS NULL OR email = ''`
  );
  await knex.raw(`ALTER TABLE leads MODIFY COLUMN email VARCHAR(100) NOT NULL`);

  // G2: Identity Guardrails (Owners)
  await knex.raw(
    `UPDATE owners SET nic = CONCAT('PENDING_', user_id) WHERE nic IS NULL OR nic = ''`
  );
  await knex.raw(`ALTER TABLE owners MODIFY COLUMN nic VARCHAR(20) NOT NULL`);

  // I3: Remove ON DELETE CASCADE from properties.owner_id
  const [rows] = await knex.raw(`
    SELECT CONSTRAINT_NAME 
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
    WHERE TABLE_NAME = 'properties' 
    AND TABLE_SCHEMA = DATABASE()
    AND COLUMN_NAME = 'owner_id'
    AND REFERENCED_TABLE_NAME IS NOT NULL
  `);

  if (rows && rows.length > 0) {
    const constraintName = rows[0].CONSTRAINT_NAME;
    await knex.raw(`ALTER TABLE properties DROP FOREIGN KEY ??`, [
      constraintName,
    ]);
  }

  // Re-add with RESTRICT
  await knex.schema.alterTable('properties', (table) => {
    table.foreign('owner_id').references('users.user_id').onDelete('RESTRICT');
  });
}

export async function down(knex) {
  // Undo I3
  const [rows] = await knex.raw(`
    SELECT CONSTRAINT_NAME 
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
    WHERE TABLE_NAME = 'properties' 
    AND TABLE_SCHEMA = DATABASE()
    AND COLUMN_NAME = 'owner_id'
    AND REFERENCED_TABLE_NAME IS NOT NULL
  `);

  if (rows && rows.length > 0) {
    const constraintName = rows[0].CONSTRAINT_NAME;
    await knex.raw(`ALTER TABLE properties DROP FOREIGN KEY ??`, [
      constraintName,
    ]);
  }

  await knex.schema.alterTable('properties', (table) => {
    table.foreign('owner_id').references('users.user_id').onDelete('CASCADE');
  });

  // Undo G2
  await knex.raw(`ALTER TABLE owners MODIFY COLUMN nic VARCHAR(20) NULL`);
  await knex.raw(`ALTER TABLE leads MODIFY COLUMN email VARCHAR(100) NULL`);
}
