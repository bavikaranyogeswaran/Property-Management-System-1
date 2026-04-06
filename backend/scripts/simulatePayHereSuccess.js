import pool from '../config/db.js';
import paymentService from '../services/paymentService.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const INVOICE_ID = 71;

async function simulateSuccess() {
  console.log(
    `[SIMULATION] Starting PayHere success simulation for Invoice #${INVOICE_ID}...`
  );

  try {
    // 1. Get invoice details to find correct amount
    const [rows] = await pool.query(
      'SELECT amount FROM rent_invoices WHERE invoice_id = ?',
      [INVOICE_ID]
    );

    if (!rows || rows.length === 0) {
      console.error(
        `[SIMULATION] ERROR: Invoice #${INVOICE_ID} not found in database.`
      );
      process.exit(1);
    }

    const amount = rows[0].amount;
    console.log(`[SIMULATION] Found invoice amount: ${amount} cents.`);

    // 2. Use the actual service to record the payment
    // This will trigger receipts, ledger entries, and update the lease
    await paymentService.recordAutomatedPayment({
      invoiceId: INVOICE_ID,
      amount: amount,
      paymentMethod: 'payhere_simulated',
      referenceNumber: 'SIM-' + Date.now(),
    });

    console.log(
      `[SIMULATION] SUCCESS: Invoice #${INVOICE_ID} has been marked as paid.`
    );
    console.log(
      `[SIMULATION] Your screen should now automatically refresh to the success state.`
    );
    process.exit(0);
  } catch (error) {
    console.error('[SIMULATION] FAILED:', error);
    process.exit(1);
  }
}

simulateSuccess();
