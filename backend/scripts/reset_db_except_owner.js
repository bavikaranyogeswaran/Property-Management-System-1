
import db from '../config/db.js';

const resetDatabase = async () => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        console.log('Starting database cleanup...');

        // 1. Delete dependent tables first (Child tables)

        // Financials
        await connection.query('DELETE FROM receipts');
        console.log('Deleted receipts');
        await connection.query('DELETE FROM payments');
        console.log('Deleted payments');
        await connection.query('DELETE FROM rent_invoices');
        console.log('Deleted rent_invoices');

        // Maintenance
        await connection.query('DELETE FROM maintenance_costs');
        console.log('Deleted maintenance_costs');
        await connection.query('DELETE FROM maintenance_requests');
        console.log('Deleted maintenance_requests');

        // Leads & Interactions
        await connection.query('DELETE FROM lead_followups');
        console.log('Deleted lead_followups');
        await connection.query('DELETE FROM lead_stage_history');
        console.log('Deleted lead_stage_history');
        await connection.query('DELETE FROM leads');
        console.log('Deleted leads');

        // Leases (connects tenants and units)
        await connection.query('DELETE FROM leases');
        console.log('Deleted leases');

        // Images
        await connection.query('DELETE FROM unit_images');
        console.log('Deleted unit_images');
        await connection.query('DELETE FROM property_images');
        console.log('Deleted property_images');

        // Core Property/Unit Data
        // Units depends on Properties and Unit Types
        await connection.query('DELETE FROM units');
        console.log('Deleted units');

        // Properties depends on Owners and Property Types
        await connection.query('DELETE FROM properties');
        console.log('Deleted properties');

        // User related extras
        await connection.query('DELETE FROM tenant_profile');
        console.log('Deleted tenant_profile');
        await connection.query('DELETE FROM notifications');
        console.log('Deleted notifications');

        // Users (Except Owner)
        // We delete users who are NOT owners.
        const [deleteUsersResult] = await connection.query("DELETE FROM users WHERE role != 'owner'");
        console.log(`Deleted ${deleteUsersResult.affectedRows} non-owner users`);

        // Types (can be deleted now that units/properties are gone)
        await connection.query('DELETE FROM unit_types');
        console.log('Deleted unit_types');
        await connection.query('DELETE FROM property_types');
        console.log('Deleted property_types');

        await connection.commit();
        console.log('Database cleanup completed successfully. Owners preserved.');

    } catch (error) {
        await connection.rollback();
        console.error('Error cleaning database:', error);
    } finally {
        connection.release();
        process.exit();
    }
};

resetDatabase();
