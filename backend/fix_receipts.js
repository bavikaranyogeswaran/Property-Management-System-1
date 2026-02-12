import pool from './config/db.js';

async function checkAndFixReceipts() {
  console.log('--- Checking Receipts ---');
  try {
    const [receipts] = await pool.query('SELECT * FROM receipts');
    console.log(`Total Receipts in DB: ${receipts.length}`);

    console.log('--- Checking Verified Payments without Receipts ---');
    // Find verified payments that have NO matching receipt_id in receipts table
    // Left join payments with receipts
    const [missing] = await pool.query(`
            SELECT p.* 
            FROM payments p
            LEFT JOIN receipts r ON p.payment_id = r.payment_id
            WHERE p.status = 'verified' AND r.receipt_id IS NULL
        `);

    console.log(`Found ${missing.length} verified payments missing receipts.`);

    if (missing.length > 0) {
      console.log('--- Backfilling Receipts ---');
      for (const payment of missing) {
        console.log(`Backfilling for Payment ID ${payment.payment_id}`);
        const receiptNumber = `REC-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        // Use payment date or current date
        const date = payment.payment_date || new Date();

        await pool.query(
          'INSERT INTO receipts (payment_id, amount, receipt_date, receipt_number) VALUES (?, ?, ?, ?)',
          [payment.payment_id, payment.amount, date, receiptNumber]
        );
      }
      console.log('--- Backfill Complete ---');
    } else {
      console.log('No backfill needed.');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

checkAndFixReceipts();
