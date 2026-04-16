/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.raw(`
    ALTER TABLE leases MODIFY COLUMN status ENUM('draft', 'pending', 'active', 'expired', 'ended', 'cancelled') DEFAULT 'draft'
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.raw(`
    ALTER TABLE leases MODIFY COLUMN status ENUM('draft', 'active', 'expired', 'ended', 'cancelled') DEFAULT 'active'
  `);
};
