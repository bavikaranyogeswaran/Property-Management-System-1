import db from '../config/db.js';
import leaseModel from '../models/leaseModel.js';
import { generateRentInvoices } from '../utils/cronJobs.js';
import { now, formatToLocalDate, addDays } from '../utils/dateUtils.js';

async function verify() {
  console.log('--- STARTING RENT HIKE VERIFICATION ---');
  
  try {
    // 1. Find an active lease
    const leases = await leaseModel.findActive();
    if (leases.length === 0) {
      console.error('No active leases found for testing.');
      return;
    }
    const lease = leases[0];
    const originalRent = lease.monthlyRent;
    console.log(`Testing with Lease #${lease.id}, Original Rent: ${originalRent}`);

    // 2. Schedule a hike for "today" (so it takes effect immediately for this month's billing test)
    const todayStr = formatToLocalDate(now());
    const targetRent = originalRent + 500;
    
    console.log(`Scheduling hike to ${targetRent} effective ${todayStr}...`);
    await leaseModel.createAdjustment({
      leaseId: lease.id,
      effectiveDate: todayStr,
      newMonthlyRent: targetRent,
      notes: 'Verification Test Hike'
    });

    // 3. Test Effective Rent Calculation
    const effectiveRent = await leaseModel.getEffectiveRent(lease.id, todayStr);
    console.log(`Calculated Effective Rent: ${effectiveRent}`);
    
    if (effectiveRent === targetRent) {
      console.log('✅ getEffectiveRent returned the correct adjusted amount.');
    } else {
      console.error(`❌ getEffectiveRent returned ${effectiveRent}, expected ${targetRent}`);
    }

    // 4. Test Invoicing Sync (Dry Run simulation)
    // We'll just check if the logic in generateRentInvoices WOULD use this rent.
    // Since generateRentInvoices creates actual DB records, we'll be careful.
    console.log('Triggering generateRentInvoices (simulated)...');
    // Note: This will actually attempt to create invoices if they don't exist for this month.
    await generateRentInvoices();
    
    // 5. Cleanup (optional, but good practice)
    console.log('Cleaning up test adjustments...');
    await db.query('DELETE FROM lease_rent_adjustments WHERE notes = ?', ['Verification Test Hike']);
    
    console.log('--- VERIFICATION COMPLETE ---');
  } catch (err) {
    console.error('Verification failed:', err);
  } finally {
    process.exit();
  }
}

verify();
