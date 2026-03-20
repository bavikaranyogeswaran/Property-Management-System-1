import renewalRequestModel from '../models/renewalRequestModel.js';
import leaseModel from '../models/leaseModel.js';
import pool from '../config/db.js';
import { addDays, parseLocalDate, formatToLocalDate } from '../utils/dateUtils.js';

class RenewalService {
    async createFromNotice(leaseId) {
        const lease = await leaseModel.findById(leaseId);
        if (!lease) throw new Error('Lease not found');

        // Check if a pending or negotiating request already exists
        const existing = await renewalRequestModel.findByLeaseId(leaseId);
        if (existing && ['pending', 'negotiating'].includes(existing.status)) {
            return existing.request_id;
        }

        const requestId = await renewalRequestModel.create({
            leaseId: leaseId,
            currentMonthlyRent: lease.monthlyRent,
            status: 'pending'
        });

        const auditLogger = (await import('../utils/auditLogger.js')).default;
        await auditLogger.log({
            userId: null,
            actionType: 'RENEWAL_REQUEST_CREATED',
            entityId: requestId,
            details: { leaseId, unitId: lease.unitId }
        });

        return requestId;
    }

    async proposeTerms(requestId, data, user) {
        const request = await renewalRequestModel.findById(requestId);
        if (!request) throw new Error('Renewal request not found');

        await renewalRequestModel.updateTerms(requestId, {
            proposedMonthlyRent: data.proposedMonthlyRent,
            proposedEndDate: data.proposedEndDate,
            notes: data.notes,
            status: 'negotiating'
        });

        const auditLogger = (await import('../utils/auditLogger.js')).default;
        await auditLogger.log({
            userId: user.id,
            actionType: 'RENEWAL_TERMS_PROPOSED',
            entityId: requestId,
            details: data
        });
    }

    async approve(requestId, user) {
        const request = await renewalRequestModel.findById(requestId);
        if (!request) throw new Error('Renewal request not found');

        if (!request.proposed_monthly_rent || !request.proposed_end_date) {
            throw new Error('Proposed terms (rent and end date) are required for approval');
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Mark request as approved
            await renewalRequestModel.updateStatus(requestId, 'approved', connection);

            // 2. Create the new DRAFT lease
            const lease = await leaseModel.findById(request.lease_id, connection);
            const nextStartDate = addDays(parseLocalDate(lease.endDate), 1);
            const nextStartDateStr = formatToLocalDate(nextStartDate);

            // [VALIDATION] Ensure the new lease period is logical
            if (new Date(request.proposed_end_date) <= nextStartDate) {
                throw new Error(`The proposed renewal end date (${request.proposed_end_date}) must be AFTER the calculated start date (${nextStartDateStr})`);
            }

            const newLeaseId = await leaseModel.create({
                tenantId: lease.tenantId,
                unitId: lease.unitId,
                startDate: nextStartDateStr,
                endDate: request.proposed_end_date,
                monthlyRent: request.proposed_monthly_rent,
                securityDeposit: 0,
                status: 'draft',
                documentUrl: null
            }, connection);

            const auditLogger = (await import('../utils/auditLogger.js')).default;
            await auditLogger.log({
                userId: user.id,
                actionType: 'RENEWAL_APPROVED',
                entityId: requestId,
                details: { newLeaseId, proposedRent: request.proposed_monthly_rent }
            }, null, connection);

            await connection.commit();
            return { newLeaseId };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async reject(requestId, user) {
        await renewalRequestModel.updateStatus(requestId, 'rejected');
        
        const auditLogger = (await import('../utils/auditLogger.js')).default;
        await auditLogger.log({
            userId: user.id,
            actionType: 'RENEWAL_REJECTED',
            entityId: requestId
        });
    }

    async getRequests(user) {
        if (user.role === 'owner') return await renewalRequestModel.findAll(user.id);
        if (user.role === 'treasurer') return await renewalRequestModel.findAll();
        if (user.role === 'tenant') {
            // Find renewal requests for this tenant's leases
            const tenantLeases = await leaseModel.findByTenantId(user.id);
            const allRequests = [];
            for (const lease of tenantLeases) {
                const req = await renewalRequestModel.findByLeaseId(lease.id);
                if (req) allRequests.push(req);
            }
            return allRequests;
        }
        throw new Error('Access denied');
    }
}

export default new RenewalService();
