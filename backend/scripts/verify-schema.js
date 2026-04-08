import knex from 'knex';
import knexConfig from '../knexfile.js';

const environment = process.env.NODE_ENV || 'development';
const db = knex(knexConfig[environment]);

const verifySchema = async () => {
  console.log(
    `[Schema Verify] Starting integrity check for environment: ${environment}`
  );
  let errors = 0;

  try {
    // 1. Check Table Existence
    const criticalTables = [
      'users',
      'tenants',
      'owners',
      'properties',
      'units',
      'leases',
      'rent_invoices',
      'payments',
      'accounting_ledger',
      'staff_property_assignments',
      'lease_terms',
    ];

    for (const table of criticalTables) {
      const exists = await db.schema.hasTable(table);
      if (!exists) {
        console.error(`[FAIL] Table "${table}" is missing!`);
        errors++;
      } else {
        console.log(`[PASS] Table "${table}" found.`);
      }
    }

    // 2. Check Constraints & Indexes
    // We check for some of the recently updated indexes
    const checkIndex = async (table, indexName) => {
      const [results] = await db.raw(
        'SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
        [table, indexName]
      );
      if (results.length === 0) {
        console.error(
          `[FAIL] Index "${indexName}" missing on table "${table}"`
        );
        errors++;
      } else {
        console.log(`[PASS] Index "${indexName}" verified on "${table}"`);
      }
    };

    await checkIndex('rent_invoices', 'unique_periodic_invoice');
    await checkIndex('staff_property_assignments', 'unique_staff_property');
    await checkIndex(
      'staff_property_assignments',
      'idx_staff_assignment_property'
    );
    await checkIndex('owners', 'unique_owner_nic');

    // 3. Check for Generated Columns
    const [genCols] = await db.raw(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'owner_payouts' AND COLUMN_NAME = 'amount' AND EXTRA LIKE '%STORED GENERATED%'"
    );
    if (genCols.length === 0) {
      console.warn(
        `[WARN] owner_payouts.amount might not be a STORED GENERATED column.`
      );
    } else {
      console.log(`[PASS] owner_payouts.amount is a STORED GENERATED column.`);
    }

    if (errors > 0) {
      console.error(
        `\n[RESULT] Schema verification FAILED with ${errors} error(s).`
      );
      process.exit(1);
    } else {
      console.log('\n[RESULT] Schema verification PASSED.');
      process.exit(0);
    }
  } catch (err) {
    console.error('[FATAL] Verification script failed:', err.message);
    process.exit(1);
  } finally {
    await db.destroy();
  }
};

verifySchema();
