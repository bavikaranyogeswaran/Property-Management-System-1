export async function up(knex) {
  const hasTable = await knex.schema.hasTable('maintenance_requests');
  if (!hasTable) return;

  const hasEta = await knex.schema.hasColumn('maintenance_requests', 'eta');
  if (!hasEta) {
    await knex.schema.alterTable('maintenance_requests', (table) => {
      table
        .datetime('eta')
        .nullable()
        .after('status')
        .comment('Estimated time of arrival/completion');
    });
  }

  const hasNotes = await knex.schema.hasColumn(
    'maintenance_requests',
    'resolution_notes'
  );
  if (!hasNotes) {
    await knex.schema.alterTable('maintenance_requests', (table) => {
      table
        .text('resolution_notes')
        .nullable()
        .after('eta')
        .comment('Treasurers notes on the resolution');
    });
  }

  const hasResolvedAt = await knex.schema.hasColumn(
    'maintenance_requests',
    'resolved_at'
  );
  if (!hasResolvedAt) {
    await knex.schema.alterTable('maintenance_requests', (table) => {
      table
        .datetime('resolved_at')
        .nullable()
        .after('resolution_notes')
        .comment('Timestamp when request was completed/closed');
    });
  }
}

export async function down(knex) {
  if (await knex.schema.hasTable('maintenance_requests')) {
    await knex.schema.alterTable('maintenance_requests', (table) => {
      table.dropColumn('eta');
      table.dropColumn('resolution_notes');
      table.dropColumn('resolved_at');
    });
  }
}
