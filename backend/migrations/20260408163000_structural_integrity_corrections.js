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
  // Prevents multiple conflicting adjustments on the same date.
  const hasInAdjustments = await knex.schema.hasTable('lease_rent_adjustments');
  if (hasInAdjustments) {
    try {
      await knex.schema.alterTable('lease_rent_adjustments', (table) => {
        table.unique(['lease_id', 'effective_date'], 'unique_lease_adjustment');
      });
    } catch (err) {
      console.warn(
        'Constraint unique_lease_adjustment already exists or failed:',
        err.message
      );
    }
  }

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
  // Removing (tenant_id, category, created_at) which uses fragile DATETIME.
  // We'll replace it with a more robust index or just rely on the primary key for uniqueness.
  if (await knex.schema.hasTable('tenant_behavior_logs')) {
    try {
      // Find the existing constraint name if possible, or try common name
      await knex.schema.alterTable('tenant_behavior_logs', (table) => {
        table.dropIndex(
          ['tenant_id', 'category', 'created_at'],
          'unique_behavior_log'
        );
      });
    } catch (err) {
      // Index might not exist or have a different name
      console.warn('Could not drop unique_behavior_log index:', err.message);
    }

    // Add a safer index that includes the log_id (Primary Key) to ensure uniqueness at scale
    await knex.schema.alterTable('tenant_behavior_logs', (table) => {
      table.index(
        ['tenant_id', 'category', 'log_id'],
        'idx_tenant_behavior_search'
      );
    });
  }
}

export async function down(knex) {
  // Revert collisions prevention
  if (await knex.schema.hasTable('tenant_behavior_logs')) {
    try {
      await knex.schema.alterTable('tenant_behavior_logs', (table) => {
        table.dropIndex([], 'idx_tenant_behavior_search');
        table.unique(
          ['tenant_id', 'category', 'created_at'],
          'unique_behavior_log'
        );
      });
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
