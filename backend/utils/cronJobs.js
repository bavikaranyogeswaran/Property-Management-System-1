import cron from 'node-cron';
import db from '../config/db.js';

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
    // Run every day at midnight
    cron.schedule('0 0 * * *', checkLeaseExpiration);
};

export default initCronJobs;
