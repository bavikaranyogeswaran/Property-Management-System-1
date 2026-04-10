/**
 * Priority 3: Refinement & Integrity Hardening
 *
 * This migration addresses data redundancy (H18, H20), schema hardening (H21, H22),
 * and structural risks in FK constraints.
 */

export async function up(knex) {
  // 1. Data Cleanup for Tenants (NOT NULL requirement)
  await knex.raw(
    "UPDATE tenants SET nic = CONCAT('PENDING_', user_id) WHERE nic IS NULL"
  );

  // 2. Refine maintenance_requests (H22)
  if (!(await knex.schema.hasColumn('maintenance_requests', 'resolved_at'))) {
    await knex.schema.alterTable('maintenance_requests', (table) => {
      table.datetime('resolved_at').nullable().after('status');
    });
  }

  // 3. Add deep-linking columns to notifications (H24)
  if (!(await knex.schema.hasColumn('notifications', 'entity_type'))) {
    await knex.schema.alterTable('notifications', (table) => {
      table.string('entity_type', 50).nullable().after('severity');
      table.integer('entity_id').unsigned().nullable().after('entity_type');
    });
  }

  // 4. Structural: Add lease_term_id to leases (with check)
  try {
    if (!(await knex.schema.hasColumn('leases', 'lease_term_id'))) {
      await knex.schema.alterTable('leases', (table) => {
        table.integer('lease_term_id').unsigned().nullable().after('unit_id');
        table
          .foreign('lease_term_id')
          .references('lease_terms.lease_term_id')
          .onDelete('SET NULL');
      });
    }
  } catch (err) {
    console.warn('Column lease_term_id might already exist:', err.message);
  }

  // 5. Hardening Constraints
  await knex.schema.alterTable('leads', (table) => {
    table.string('email', 100).notNullable().alter();
  });

  await knex.schema.alterTable('owners', (table) => {
    table.string('nic', 20).notNullable().alter();
  });

  await knex.schema.alterTable('tenants', (table) => {
    table.string('nic', 20).notNullable().alter();
  });

  // 6. Fix Dangerous FK: properties.owner_id (CASCADE -> RESTRICT)
  try {
    const [rows] = await knex.raw(
      "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_NAME = 'properties' AND COLUMN_NAME = 'owner_id' AND REFERENCED_TABLE_NAME IS NOT NULL"
    );
    if (rows.length > 0) {
      const constraintName = rows[0].CONSTRAINT_NAME;
      await knex.schema.alterTable('properties', (table) => {
        table.dropForeign([], constraintName);
        table
          .foreign('owner_id')
          .references('users.user_id')
          .onDelete('RESTRICT')
          .onUpdate('CASCADE');
      });
    }
  } catch (err) {
    console.warn(
      'FK property_owner_id already restricted or missing:',
      err.message
    );
  }

  // 7. Fix property_visits FK actions
  try {
    const [propRows] = await knex.raw(
      "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_NAME = 'property_visits' AND COLUMN_NAME = 'property_id' AND REFERENCED_TABLE_NAME IS NOT NULL"
    );
    const [unitRows] = await knex.raw(
      "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_NAME = 'property_visits' AND COLUMN_NAME = 'unit_id' AND REFERENCED_TABLE_NAME IS NOT NULL"
    );

    await knex.schema.alterTable('property_visits', (table) => {
      if (propRows.length > 0)
        table.dropForeign([], propRows[0].CONSTRAINT_NAME);
      if (unitRows.length > 0)
        table.dropForeign([], unitRows[0].CONSTRAINT_NAME);

      table
        .foreign('property_id')
        .references('properties.property_id')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');
      table
        .foreign('unit_id')
        .references('units.unit_id')
        .onDelete('SET NULL')
        .onUpdate('CASCADE');
    });
  } catch (err) {
    console.warn('property_visits FKs already fixed or missing:', err.message);
  }

  // 8. Convert accounting_ledger.category to ENUM (H21)
  await knex.raw(`
    ALTER TABLE accounting_ledger 
    MODIFY COLUMN category ENUM('deposit_held', 'deposit_refund', 'deposit_withheld', 'deposit_accrued', 'rent', 'late_fee', 'maintenance', 'management_fee', 'maintenance_repair', 'other') NOT NULL
  `);

  // 9. Drop Redundant Columns (H18, H20)
  if (await knex.schema.hasColumn('properties', 'features')) {
    await knex.schema.alterTable('properties', (table) => {
      table.dropColumn('features');
    });
  }

  if (await knex.schema.hasColumn('receipts', 'amount')) {
    await knex.schema.alterTable('receipts', (table) => {
      table.dropColumn('amount');
    });
  }
}

export async function down(knex) {
  // Re-add redundant columns
  if (!(await knex.schema.hasColumn('properties', 'features'))) {
    await knex.schema.alterTable('properties', (table) => {
      table.json('features').nullable();
    });
  }

  if (!(await knex.schema.hasColumn('receipts', 'amount'))) {
    await knex.schema.alterTable('receipts', (table) => {
      table.bigInteger('amount').notNullable().defaultTo(0);
    });
  }

  // Revert accounting_ledger category to string
  await knex.schema.alterTable('accounting_ledger', (table) => {
    table.string('category', 50).notNullable().alter();
  });

  // Revert notification columns
  if (await knex.schema.hasColumn('notifications', 'entity_type')) {
    await knex.schema.alterTable('notifications', (table) => {
      table.dropColumn('entity_type');
      table.dropColumn('entity_id');
    });
  }

  // Revert maintenance_requests
  if (await knex.schema.hasColumn('maintenance_requests', 'resolved_at')) {
    await knex.schema.alterTable('maintenance_requests', (table) => {
      table.dropColumn('resolved_at');
    });
  }

  // Revert leaks/owners/tenants NOT NULL
  await knex.schema.alterTable('leads', (table) => {
    table.string('email', 100).nullable().alter();
  });
  await knex.schema.alterTable('owners', (table) => {
    table.string('nic', 20).nullable().alter();
  });
  await knex.schema.alterTable('tenants', (table) => {
    table.string('nic', 20).nullable().alter();
  });

  // Revert FKs
  try {
    await knex.schema.alterTable('properties', (table) => {
      table.dropForeign('owner_id');
      table
        .foreign('owner_id')
        .references('users.user_id')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');
    });
  } catch (err) {}

  if (await knex.schema.hasColumn('leases', 'lease_term_id')) {
    await knex.schema.alterTable('leases', (table) => {
      table.dropForeign('lease_term_id');
      table.dropColumn('lease_term_id');
    });
  }

  try {
    await knex.schema.alterTable('property_visits', (table) => {
      table.dropForeign('property_id');
      table.dropForeign('unit_id');
      table
        .foreign('property_id')
        .references('properties.property_id')
        .onDelete('RESTRICT')
        .onUpdate('RESTRICT');
      table
        .foreign('unit_id')
        .references('units.unit_id')
        .onDelete('RESTRICT')
        .onUpdate('RESTRICT');
    });
  } catch (err) {}
}
