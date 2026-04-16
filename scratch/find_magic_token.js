import pool from '../backend/config/db.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

async function findMagicToken() {
  try {
    const [rows] = await pool.query(
      'SELECT magic_token, invoice_id FROM rent_invoices WHERE magic_token IS NOT NULL LIMIT 1'
    );
    console.log(JSON.stringify(rows));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

findMagicToken();
