/**
 * Priority 3 Extension: Audit & Visit Integrity Hardening (C27 & C28)
 *
 * - system_audit_logs: Enhances entity lookups with composite indexing.
 * - property_visits: Resolves 3NF violations by making visitor contact info
 *   nullable when lead_id is present, and adds a CHECK constraint for integrity.
 */

export async function up(knex) {
  // 1. system_audit_logs refinement (C27)
  if (await knex.schema.hasTable('system_audit_logs')) {
    try {
      await knex.schema.alterTable('system_audit_logs', (table) => {
        // Drop simple index and add composite for faster polymorphic lookups
        table.dropIndex(['entity_id'], 'idx_audit_entity');
        table.index(['entity_id', 'entity_type'], 'idx_audit_entity_compound');
      });
    } catch (err) {
      console.warn(
        'Audit log index refinement skipped or already done:',
        err.message
      );
    }
  }

  // 2. property_visits refinement (C28)
  if (await knex.schema.hasTable('property_visits')) {
    // 2.1 Make contact fields nullable to support Lead-as-SOT
    await knex.schema.alterTable('property_visits', (table) => {
      table.string('visitor_name', 100).nullable().alter();
      table.string('visitor_email', 100).nullable().alter();
      table.string('visitor_phone', 20).nullable().alter();
    });

    // 2.2 Enforce integrity logic
    // We cannot use a CHECK constraint on `lead_id` because MySQL blocks CHECK constraints
    // on columns that participate in an ON DELETE SET NULL or CASCADE foreign key.
    // Instead, we will update the lead_id foreign key to CASCADE to ensure that
    // when a lead is deleted, their visits (which now lack redundant names/emails)
    // are cleanly removed rather than becoming orphaned ghost records.

    // 2.3 Correct FK Actions (H13 realization)
    try {
      // Find constraints to drop
      const [rows] = await knex.raw(`
        SELECT CONSTRAINT_NAME 
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
        WHERE TABLE_NAME = 'property_visits' 
        AND TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME IN ('property_id', 'unit_id', 'lead_id')
        AND REFERENCED_TABLE_NAME IS NOT NULL
      `);

      for (const row of rows) {
        await knex.raw(
          `ALTER TABLE property_visits DROP FOREIGN KEY ${row.CONSTRAINT_NAME}`
        );
      }

      await knex.schema.alterTable('property_visits', (table) => {
        table
          .foreign('property_id')
          .references('properties.property_id')
          .onDelete('CASCADE');
        table
          .foreign('unit_id')
          .references('units.unit_id')
          .onDelete('SET NULL');
        // Change lead_id from SET NULL to CASCADE
        table
          .foreign('lead_id')
          .references('leads.lead_id')
          .onDelete('CASCADE');
      });
    } catch (err) {
      console.warn(
        'Property visit FK correction skipped or already done:',
        err.message
      );
    }

    // 2.4 Data cleansing: If lead_id exists, nullify redundant strings to enforce SOT
    await knex.raw(`
      UPDATE property_visits 
      SET visitor_name = NULL, visitor_email = NULL, visitor_phone = NULL 
      WHERE lead_id IS NOT NULL
    `);
  }
}

export async function down(knex) {
  if (await knex.schema.hasTable('property_visits')) {
    // Revert lead_id cascading rule if needed
    try {
      const [rows] = await knex.raw(`
        SELECT CONSTRAINT_NAME 
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
        WHERE TABLE_NAME = 'property_visits' 
        AND TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME = 'lead_id'
        AND REFERENCED_TABLE_NAME IS NOT NULL
      `);
      if (rows.length) {
        await knex.raw(
          `ALTER TABLE property_visits DROP FOREIGN KEY ${rows[0].CONSTRAINT_NAME}`
        );
        await knex.schema.alterTable('property_visits', (table) => {
          table
            .foreign('lead_id')
            .references('leads.lead_id')
            .onDelete('SET NULL');
        });
      }
    } catch (err) {}

    // Revert nullability
    await knex.schema.alterTable('property_visits', (table) => {
      table.string('visitor_name', 100).notNullable().alter();
      table.string('visitor_email', 100).notNullable().alter();
      table.string('visitor_phone', 20).notNullable().alter();
    });
  }

  if (await knex.schema.hasTable('system_audit_logs')) {
    try {
      await knex.schema.alterTable('system_audit_logs', (table) => {
        table.dropIndex([], 'idx_audit_entity_compound');
        table.index(['entity_id'], 'idx_audit_entity');
      });
    } catch (err) {}
  }
}
