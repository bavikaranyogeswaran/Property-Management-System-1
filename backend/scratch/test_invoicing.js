import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import * as jobs from '../utils/cronJobs.js';
import db from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function testInvoicing() {
  console.log('--- Manual Invoice Generation Test ---');
  try {
    const result = await jobs.generateRentInvoices();
    console.log('Result:', result);
  } catch (error) {
    console.error('Error during invoicing:', error);
  } finally {
    // Graceful shutdown: give the pool a moment to drain
    setTimeout(() => process.exit(0), 1000);
  }
}

testInvoicing();
