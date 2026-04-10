/**
 * Priority 3 Extension: Structural Integrity Hardening (C4, C7, C21, C24)
 *
 * - C4: Owners (Staff) NIC Uniqueness constraint added.
 * - C7: Properties uniqueness enforced on (owner_id, property_no, is_archived).
 * - C21: Receipts amount column dropped to resolve 3NF violation and NOT NULL crash.
 * - C24: Maintenance Costs unique constraint refined to avoid prefix collision risk.
 */

export async function up(knex) {
  // C4: Owners (Staff) NIC Uniqueness
  if (await knex.schema.hasTable('staff')) {
    try {
      await knex.schema.alterTable('staff', (table) => {
        table.unique('nic', 'unique_staff_nic');
      });
    } catch (err) {
      console.warn(
        'Constraint unique_staff_nic already exists or failed:',
        err.message
      );
    }
  }

  // C7: Properties uniqueness on property_no within an owner's portfolio
  if (await knex.schema.hasTable('properties')) {
    try {
      await knex.schema.alterTable('properties', (table) => {
        table.unique(
          ['owner_id', 'property_no', 'is_archived'],
          'unique_property_no'
        );
      });
    } catch (err) {
      console.warn(
        'Constraint unique_property_no already exists or failed:',
        err.message
      );
    }
  }

  // C21: Receipts drop redundant amount column
  if (await knex.schema.hasTable('receipts')) {
    if (await knex.schema.hasColumn('receipts', 'amount')) {
      await knex.schema.alterTable('receipts', (table) => {
        table.dropColumn('amount');
      });
    }
  }

  // C24: Maintenance Costs unique constraint refinement
  if (await knex.schema.hasTable('maintenance_costs')) {
    try {
      // 1. Find the foreign key constraint name on request_id
      const [fkRows] = await knex.raw(`
        SELECT CONSTRAINT_NAME 
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
        WHERE TABLE_NAME = 'maintenance_costs' 
        AND TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME = 'request_id'
        AND REFERENCED_TABLE_NAME IS NOT NULL
      `);

      if (fkRows && fkRows.length > 0) {
        for (const row of fkRows) {
          await knex.raw(
            `ALTER TABLE maintenance_costs DROP FOREIGN KEY ${row.CONSTRAINT_NAME}`
          );
        }
      }

      // 2. Now we can drop the index that was supporting the FK
      try {
        await knex.raw(
          'ALTER TABLE maintenance_costs DROP INDEX unique_cost_entry'
        );
      } catch (e) {
        console.warn('Index unique_cost_entry already gone or missing');
      }

      // 3. Recreate using a safer composite key that avoids VARCHAR prefix hashing
      await knex.schema.alterTable('maintenance_costs', (table) => {
        table.unique(
          ['request_id', 'amount', 'recorded_date', 'bill_to'],
          'unique_cost_entry_safe'
        );
        // 4. Re-add the foreign key
        table
          .foreign('request_id')
          .references('maintenance_requests.request_id')
          .onDelete('CASCADE');
      });
    } catch (err) {
      console.warn(
        'Issue refining maintenance_costs typical constraints:',
        err.message
      );
    }
  }
}

export async function down(knex) {
  if (await knex.schema.hasTable('maintenance_costs')) {
    try {
      await knex.schema.alterTable('maintenance_costs', (table) => {
        table.dropUnique([], 'unique_cost_entry_safe');
      });
      // Recreate old flawed index using Raw to ensure prefix length is preserved (if possible, but usually hard to rollback cleanly)
      await knex.raw(
        'ALTER TABLE maintenance_costs ADD UNIQUE INDEX unique_cost_entry (request_id, description(255), amount, recorded_date)'
      );
    } catch (err) {}
  }

  if (await knex.schema.hasTable('receipts')) {
    if (!(await knex.schema.hasColumn('receipts', 'amount'))) {
      await knex.schema.alterTable('receipts', (table) => {
        table.bigInteger('amount').notNullable().defaultTo(0);
      });
    }
  }

  if (await knex.schema.hasTable('properties')) {
    try {
      await knex.schema.alterTable('properties', (table) => {
        table.dropUnique([], 'unique_property_no');
      });
    } catch (err) {}
  }

  if (await knex.schema.hasTable('staff')) {
    try {
      await knex.schema.alterTable('staff', (table) => {
        table.dropUnique([], 'unique_staff_nic');
      });
    } catch (err) {}
  }
}
