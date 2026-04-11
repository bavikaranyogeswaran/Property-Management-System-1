/**
 * Priority 3 Extension: Structural Integrity Corrections
 *
 * Implements specific hardening for:
 * - Lease Rent Adjustments (UNIQUE constraints)
 * - Lead Access Tokens (Soft revocation for audit)
 * - Lead Followups (Audit timestamps + UNIQUE)
 * - Tenant Behavior Logs (Reduced collision risk)
 */

export async function up(knex) {
  // 1. C18: Lease Rent Adjustments UNIQUE Key
  // This was already added in 20260408150000_p2_performance_integrity.js
  // Removed redundant definition here to prevent Knex transaction poisoning.

  // 2. C15: Lead Access Tokens - Soft Invalidation
  if (await knex.schema.hasTable('lead_access_tokens')) {
    if (!(await knex.schema.hasColumn('lead_access_tokens', 'is_revoked'))) {
      await knex.schema.alterTable('lead_access_tokens', (table) => {
        table.boolean('is_revoked').defaultTo(false).after('token');
        table.datetime('revoked_at').nullable().after('is_revoked');
      });
    }
  }

  // 3. C12: Lead Followups - Audit Trail + UNIQUE
  if (await knex.schema.hasTable('lead_followups')) {
    if (!(await knex.schema.hasColumn('lead_followups', 'created_at'))) {
      await knex.schema.alterTable('lead_followups', (table) => {
        table.datetime('created_at').defaultTo(knex.fn.now());
      });
    }
    try {
      await knex.schema.alterTable('lead_followups', (table) => {
        // Limited notes prefix for UNIQUE key compatibility
        table.unique(['lead_id', 'followup_date'], 'unique_lead_followup');
      });
    } catch (err) {
      console.warn(
        'Constraint unique_lead_followup already exists or failed:',
        err.message
      );
    }
  }

  // 4. C3: Tenant Behavior Logs - Collision Prevention
  if (await knex.schema.hasTable('tenant_behavior_logs')) {
    // Check if the old unique index 'unique_daily_behavior' exists before dropping
    const [indexes] = await knex.raw(
      "SHOW INDEX FROM tenant_behavior_logs WHERE Key_name = 'unique_daily_behavior'"
    );
    if (indexes.length > 0) {
      // Add a temporary index to satisfy the foreign key on tenant_id
      // before dropping the unique constraint that currently supports it.
      await knex.schema.alterTable('tenant_behavior_logs', (table) => {
        table.index(['tenant_id'], 'idx_tenant_behavior_fk_temp');
      });

      await knex.schema.alterTable('tenant_behavior_logs', (table) => {
        table.dropUnique(
          ['tenant_id', 'category', 'created_at'],
          'unique_daily_behavior'
        );
      });

      // We can drop the temporary index now because 'idx_tenant_behavior_search'
      // (added below) will satisfy the FK since it starts with tenant_id.
    }

    // Check if the target index 'idx_tenant_behavior_search' already exists before adding
    const [newIndexes] = await knex.raw(
      "SHOW INDEX FROM tenant_behavior_logs WHERE Key_name = 'idx_tenant_behavior_search'"
    );
    if (newIndexes.length === 0) {
      await knex.schema.alterTable('tenant_behavior_logs', (table) => {
        table.index(
          ['tenant_id', 'category', 'log_id'],
          'idx_tenant_behavior_search'
        );
      });
    }

    // Drop the temporary index now that 'idx_tenant_behavior_search' exists to support the FK
    try {
      await knex.schema.alterTable('tenant_behavior_logs', (table) => {
        table.dropIndex(['tenant_id'], 'idx_tenant_behavior_fk_temp');
      });
    } catch (err) {
      // Ignore if already dropped or never created
    }
  }
}

export async function down(knex) {
  // Revert collisions prevention
  if (await knex.schema.hasTable('tenant_behavior_logs')) {
    const [indexes] = await knex.raw(
      "SHOW INDEX FROM tenant_behavior_logs WHERE Key_name = 'idx_tenant_behavior_search'"
    );
    if (indexes.length > 0) {
      // Add a temporary index to satisfy the foreign key on tenant_id
      // before dropping the search index that currently supports it.
      await knex.schema.alterTable('tenant_behavior_logs', (table) => {
        table.index(['tenant_id'], 'idx_tenant_behavior_fk_temp_down');
      });

      await knex.schema.alterTable('tenant_behavior_logs', (table) => {
        table.dropIndex([], 'idx_tenant_behavior_search');
      });
    }

    const [oldIndexes] = await knex.raw(
      "SHOW INDEX FROM tenant_behavior_logs WHERE Key_name = 'unique_daily_behavior'"
    );
    if (oldIndexes.length === 0) {
      await knex.schema.alterTable('tenant_behavior_logs', (table) => {
        table.unique(
          ['tenant_id', 'category', 'created_at'],
          'unique_daily_behavior'
        );
      });
    }

    // Drop the temporary index now that 'unique_daily_behavior' is back
    try {
      const [tempIndexes] = await knex.raw(
        "SHOW INDEX FROM tenant_behavior_logs WHERE Key_name = 'idx_tenant_behavior_fk_temp_down'"
      );
      if (tempIndexes.length > 0) {
        await knex.schema.alterTable('tenant_behavior_logs', (table) => {
          table.dropIndex([], 'idx_tenant_behavior_fk_temp_down');
        });
      }
    } catch (err) {}
  }

  // Revert followup changes
  if (await knex.schema.hasTable('lead_followups')) {
    try {
      await knex.schema.alterTable('lead_followups', (table) => {
        table.dropUnique([], 'unique_lead_followup');
        table.dropColumn('created_at');
      });
    } catch (err) {}
  }

  // Revert token changes
  if (await knex.schema.hasTable('lead_access_tokens')) {
    await knex.schema.alterTable('lead_access_tokens', (table) => {
      table.dropColumn('is_revoked');
      table.dropColumn('revoked_at');
    });
  }

  // Revert adjustments UNIQUE
  if (await knex.schema.hasTable('lease_rent_adjustments')) {
    try {
      await knex.schema.alterTable('lease_rent_adjustments', (table) => {
        table.dropUnique([], 'unique_lease_adjustment');
      });
    } catch (err) {}
  }
}
