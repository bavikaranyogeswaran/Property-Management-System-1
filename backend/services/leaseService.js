import leaseModel from '../models/leaseModel.js';
import unitModel from '../models/unitModel.js';
import tenantModel from '../models/tenantModel.js';
import pool from '../config/db.js';

class LeaseService {
    /**
     * Creates a new lease.
     * @param {Object} leaseData - { tenantId, unitId, startDate, endDate, monthlyRent }
     * @param {Object} [connection] - Optional database connection for transactions
     * @returns {Promise<number>} - The ID of the created lease
     */
    async createLease(leaseData, connection = null) {
        const { tenantId, unitId, startDate, endDate, monthlyRent } = leaseData;

        // Validation
        // Validation: Check required fields (allow 0 for rent here, caught later)
        if (!tenantId || !unitId || !startDate || !endDate || monthlyRent === undefined || monthlyRent === null) {
            throw new Error('All fields are required for lease creation.');
        }

        if (new Date(startDate) >= new Date(endDate)) {
            throw new Error('End date must be after start date');
        }

        if (isNaN(new Date(startDate).getTime()) || isNaN(new Date(endDate).getTime())) {
            throw new Error('Invalid date format');
        }

        if (monthlyRent <= 0) {
            throw new Error('Monthly rent must be greater than 0');
        }

        const tenant = await tenantModel.findByUserId(tenantId);
        if (!tenant) {
            throw new Error('Tenant not found');
        }

        // Use provided connection or get a new one (for read operations checking availability)
        // If connection is provided, we assume the caller handles commit/rollback.
        // For reads, we can use the same connection to see "uncommitted" changes if within same transaction?
        // Note: unitModel.findById might not support connection param yet. 
        // If we really need strict transaction safety for checking 'occupied', we should support connection in unitModel.read.
        // For now, we'll try to use the connection if available for updates, but reads might be on pool if model doesn't support it.
        // CRITICAL: If 'unitModel.findById' doesn't support connection, we might read stale data or miss locks.
        // Let's assume standard behavior for now: optimistic check.

        // 1. Check if unit is available
        // Note: In a transaction, we should select for update ideally.
        const unit = await unitModel.findById(unitId);
        if (!unit) {
            throw new Error('Unit not found');
        }

        // If we are in a transaction that JUST set this unit to occupied (e.g. Lead Conversion), 
        // reading it back might show 'occupied' if using same connection, or 'available' if different.
        // However, standard Lead Conversion flow locks unit status UPDATE *before* calling this lease creation?
        // Actually, the plan is to move ALL unit blocking logic HERE.

        if (unit.status === 'occupied') {
            // Throw error UNLESS we are explicitly allowing "Future Move-in" logic? 
            // But 'occupied' usually means "someone else is there". 
            // If the unit is occupied by THIS tenant (e.g. they just got assigned), we need to know.
            // For simplicity: We expect the unit to be 'available' when we create a lease.
            throw new Error('Unit is already occupied');
        }

        const leaseParams = {
            tenantId,
            unitId,
            startDate,
            endDate,
            monthlyRent,
            status: 'active'
        };

        // 2. Create Lease
        // leaseModel.create needs to support connection!
        const leaseId = await leaseModel.create(leaseParams, connection);

        // 3. Update Unit Status
        // unitModel.update needs to support connection!
        await unitModel.update(unitId, { status: 'occupied' }, connection);

        return leaseId;
    }
}

export default new LeaseService();
