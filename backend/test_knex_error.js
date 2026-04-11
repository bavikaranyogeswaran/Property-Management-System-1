const knex = require('knex');
const config = require('./knexfile.js').default.test;

async function test() {
  const db = knex(config);
  try {
    console.log('Running test...');
    try {
      await db.schema.alterTable('lease_rent_adjustments', (table) => {
        table.unique(['lease_id', 'effective_date'], 'unique_lease_adjustment');
      });
    } catch (err) {
      console.warn(
        'Constraint unique_lease_adjustment already exists or failed:',
        err.message
      );
    }

    // Check if process is still running fine and db is still usable
    const res = await db.raw('SELECT 1+1 AS result');
    console.log('DB connection still works!', res[0][0].result);
  } catch (e) {
    console.error('Fatal error:', e);
  } finally {
    await db.destroy();
  }
}

test();
