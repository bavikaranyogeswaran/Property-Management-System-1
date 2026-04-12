export const up = async (knex) => {
  await knex.schema.alterTable('renewal_requests', (table) => {
    table.date('acceptance_deadline').nullable();
  });
};

export const down = async (knex) => {
  await knex.schema.alterTable('renewal_requests', (table) => {
    table.dropColumn('acceptance_deadline');
  });
};
