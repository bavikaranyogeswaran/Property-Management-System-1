import cron from 'node-cron';
import db from '../config/db.js';
import leaseModel from '../models/leaseModel.js';
import invoiceModel from '../models/invoiceModel.js';

export const generateRentInvoices = async () => {
    console.log('Running automated rent invoicing...');
    const today = new Date();

    // Check if it's the 1st of the month (or for testing purposes, we assume checks are safe to run anytime due to existence check)
    // Production: if (today.getDate() !== 1) return;

    // We'll leave the date check commented out for easier testing/demos, OR enforce it but export a force mode.
    // For this implementation, I will enforcing the check but skip it if running via manual function call in tests?
    // Actually, usually cron runs blindly. The logic inside should guard.
    // Let's implement: Run ANY day, but only create if missing for THIS month.
    // This makes it robust (if server is down on 1st, it catches up on 2nd).

    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // 1-12
    const dueDate = new Date(today.getFullYear(), today.getMonth(), 10); // Due on 10th? Or +X days. Let's say 10th.

    try {
        const activeLeases = await leaseModel.findActive(); // Should return all active (and pending? no only active)
        console.log(`Found ${activeLeases.length} active leases.`);

        let createdCount = 0;
        for (const lease of activeLeases) {
            // Check if invoice exists for this month
            const exists = await invoiceModel.exists(lease.id, currentYear, currentMonth);
            if (!exists) {
                console.log(`Creating invoice for Lease ${lease.id} (Unit ${lease.unitNumber})...`);
                await invoiceModel.create({
                    leaseId: lease.id,
                    amount: lease.monthlyRent,
                    dueDate: dueDate.toISOString().split('T')[0],
                    description: `Rent for ${currentYear}-${currentMonth}`
                });
                createdCount++;
            }
        }
        console.log(`Automated Invoicing: Created ${createdCount} new invoices.`);

    } catch (error) {
        console.error('Error in automated invoicing:', error);
    }
};

export const checkLeaseExpiration = async () => {
    console.log('Running lease expiration check...');
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const today = new Date().toISOString().split('T')[0];

        // Find active leases past end date
        const [expiredLeases] = await connection.query(`
            SELECT lease_id, unit_id FROM leases 
            WHERE status = 'active' AND end_date < ?
        `, [today]);

        if (expiredLeases.length > 0) {
            console.log(`Found ${expiredLeases.length} expired leases.`);

            for (const lease of expiredLeases) {
                // valid ENUM is 'ended'
                await connection.query(
                    "UPDATE leases SET status = 'ended' WHERE lease_id = ?",
                    [lease.lease_id]
                );

                await connection.query(
                    "UPDATE units SET status = 'available' WHERE unit_id = ?",
                    [lease.unit_id]
                );
            }
        } else {
            console.log('No expired leases found.');
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        console.error('Error in lease expiration check:', error);
    } finally {
        connection.release();
    }
};

const initCronJobs = () => {
    // Run every day at midnight (Lease Expiry)
    cron.schedule('0 0 * * *', checkLeaseExpiration);

    // Run every day at 1:00 AM (Invoicing)
    cron.schedule('0 1 * * *', generateRentInvoices);
};

export default initCronJobs;
