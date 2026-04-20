// ============================================================================
//  MAINTENANCE SERVICE (The Handyman logic)
// ============================================================================
//  This service manages the lifecycle of maintenance requests.
//  It handles submitting issues, tracking repair costs, updating statuses,
//  and billing tenants if they were responsible for the damage.
// ============================================================================

import maintenanceRequestModel from '../models/maintenanceRequestModel.js';
import propertyModel from '../models/propertyModel.js';
import notificationModel from '../models/notificationModel.js';
import unitModel from '../models/unitModel.js';
import leaseModel from '../models/leaseModel.js';
import invoiceModel from '../models/invoiceModel.js';
import userModel from '../models/userModel.js';
import emailService from '../utils/emailService.js';
import maintenanceCostModel from '../models/maintenanceCostModel.js';
import ledgerModel from '../models/ledgerModel.js';
import pool from '../config/db.js';
import {
  getCurrentDateString,
  getLocalTime,
  today,
  now,
  addDays,
  formatToLocalDate,
} from '../utils/dateUtils.js';
import { toCentsFromMajor, fromCents } from '../utils/moneyUtils.js';
import authorizationService from './authorizationService.js';
import paymentService from './paymentService.js';
import { ROLES } from '../utils/roleUtils.js';
import auditLogger from '../utils/auditLogger.js';
import staffModel from '../models/staffModel.js';
import AppError from '../utils/AppError.js';

class MaintenanceService {
  // CREATE REQUEST: Tenant submits a new issue (with images) to be fixed.
  async createRequest(data, tenantId) {
    const { unitId, title, description, priority, images } = data;

    // 1. [SECURITY] RBAC: Verify tenant currently LEASES this unit
    const tenantLeases = await leaseModel.findByTenantId(tenantId);
    const isLeased = tenantLeases.some(
      (l) => l.unitId === unitId.toString() && l.status === 'active'
    );

    if (!isLeased) {
      throw new AppError(
        'Access denied. No active lease found for this unit.',
        403
      );
    }

    // 2. [SECURITY] Content-Aware Deduplication to prevent spamming
    const isDuplicate = await maintenanceRequestModel.findRecentDuplicate(
      unitId,
      tenantId,
      title,
      description
    );
    if (isDuplicate) {
      throw new AppError('Similar request already submitted recently.', 400);
    }

    // 3. Flood Protection: Max 5 open requests per unit
    const openCount = await maintenanceRequestModel.countOpenByUnitId(unitId);
    if (openCount >= 5) {
      throw new AppError('Maximum open requests reached for this unit.', 400);
    }

    // 4. Create the Maintenance Request record
    const requestId = await maintenanceRequestModel.create({
      unitId,
      tenantId,
      title,
      description,
      priority,
      category: data.category || 'general',
      images,
    });

    // 5. [SIDE EFFECT] Notify Owner of the new issue
    try {
      const unit = await unitModel.findById(unitId);
      if (unit?.propertyId) {
        const property = await propertyModel.findById(unit.propertyId);
        if (property?.ownerId) {
          await notificationModel.create({
            userId: property.ownerId,
            message: `New Maintenance Request for Unit ${unit.unitNumber}: ${title}`,
            type: 'maintenance',
            severity: 'warning',
            entityType: 'maintenance_request',
            entityId: requestId,
          });
        }
      }
    } catch (notifyErr) {
      console.error('Owner notification failed:', notifyErr);
    }

    return requestId;
  }

  // UPDATE STATUS: Moves a request through the workflow.
  async updateStatus(id, data, user) {
    const { status } = data;
    // 1. [SECURITY] RBAC check
    if (!authorizationService.isAtLeast(user.role, ROLES.TREASURER)) {
      throw new AppError(
        'Only Treasurers/Owners can update maintenance status',
        403
      );
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const request = await maintenanceRequestModel.findById(id);
      if (!request) throw new AppError('Request not found', 404);

      // 2. [SECURITY] Estate-specific assignment check for Treasurers
      if (user.role === ROLES.TREASURER) {
        const unit = await unitModel.findById(request.unitId, connection);
        if (!unit) throw new AppError('Unit not found', 404);
        const isAssigned = await staffModel.isAssignedToProperty(
          user.id,
          unit.propertyId
        );
        if (!isAssigned)
          throw new AppError(
            'Access denied: Property assignment required.',
            403
          );
      }

      // 3. [SECURITY] State Machine Guardrails to prevent status regression
      if (request.status === 'completed' || request.status === 'closed') {
        if (status !== request.status)
          throw new AppError(
            `Cannot update status of a ${request.status} request.`,
            400
          );
      }
      if (request.status === 'in_progress' && status === 'submitted') {
        throw new AppError(
          'Cannot move request backwards from in_progress to submitted.',
          400
        );
      }

      // 4. Record new status and technician metadata
      const assignmentData = {
        assignedTo: data.assignedTo,
        assignedBy: user.id,
        eta: data.eta,
        resolutionNotes: data.resolutionNotes,
      };

      const updated = await maintenanceRequestModel.updateStatus(
        id,
        status,
        assignmentData
      );

      // 5. [AUDIT] Track resolution time
      if (status === 'completed' || status === 'closed') {
        await connection.query(
          'UPDATE maintenance_requests SET resolved_at = NOW() WHERE request_id = ? AND resolved_at IS NULL',
          [id]
        );
      }

      // 6. [CONCURRENCY] Unit Availability Synchronization
      if (status === 'completed' || status === 'closed') {
        // [HARDENED] Deterministic Locking Order (Unit first)
        const unitLock = await unitModel.findByIdForUpdate(
          request.unitId,
          connection
        );
        if (!unitLock) throw new AppError('Unit reference not found.', 404);

        const openCount = await maintenanceRequestModel.countOpenByUnitId(
          request.unitId,
          connection
        );

        // If no more open tasks, release the unit status
        if (openCount === 0 && unitLock.status === 'maintenance') {
          // Check for future lease commitments
          const [futureLeases] = await connection.query(
            `SELECT COUNT(*) as count FROM leases WHERE unit_id = ? AND status IN ('active', 'pending', 'draft') AND (start_date > CURRENT_DATE() OR (status = 'draft' AND (reservation_expires_at IS NULL OR reservation_expires_at >= CURRENT_DATE())))`,
            [request.unitId]
          );
          const nextStatus =
            futureLeases[0].count > 0 ? 'reserved' : 'available';
          await unitModel.update(
            request.unitId,
            { status: nextStatus },
            connection
          );
        }
      }

      await connection.commit();

      // 7. [SIDE EFFECT] Notify Tenant and Staff of status change (Non-blocking)
      if (status === 'completed' || status === 'in_progress') {
        try {
          if (request?.tenant_id) {
            await notificationModel.create({
              userId: request.tenant_id,
              message:
                status === 'completed'
                  ? `Maintenance Request '${request.title}' completed.`
                  : `Maintenance Request '${request.title}' in progress.`,
              type: 'maintenance',
              entityType: 'maintenance_request',
              entityId: id,
            });

            const tenant = await userModel.findById(request.tenant_id);
            if (tenant?.email) {
              const unit = await unitModel.findById(request.unitId);
              const property = unit
                ? await propertyModel.findById(unit.propertyId)
                : null;
              await emailService.sendMaintenanceStatusUpdate(tenant.email, {
                title: request.title,
                status,
                propertyName: property?.name,
                unitNumber: unit?.unitNumber,
              });
            }
          }

          if (status === 'completed') {
            const treasurers = await userModel.findByRole(ROLES.TREASURER);
            for (const t of treasurers) {
              await notificationModel.create({
                userId: t.user_id,
                message: `Maintenance Request '${request.title}' completed. Review costs.`,
                type: 'maintenance',
                entityType: 'maintenance_request',
                entityId: id,
              });
            }
          }
        } catch (err) {
          console.error('Status update notification failed:', err);
        }
      }

      return updated;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // CREATE INVOICE: Generates a bill for the tenant for maintenance-related costs.
  async createInvoice(data, user) {
    // 1. [SECURITY] RBAC check
    if (!authorizationService.isAtLeast(user.role, ROLES.TREASURER)) {
      throw new AppError(
        'Only Treasurers/Owners can create maintenance invoices.',
        403
      );
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const { requestId, amount, dueDate, description } = data;

      // 2. Locate request and historical lease context
      const request = await maintenanceRequestModel.findById(
        requestId,
        connection
      );
      if (!request) throw new AppError('Maintenance Request not found', 404);

      const targetLease = await this._getLeaseForRequest(requestId, connection);
      if (!targetLease) {
        throw new AppError(
          'Critical Integrity Error: No historical lease found via _getLeaseForRequest.',
          409
        );
      }

      // 3. Aggregate all unbilled costs associated with this job
      const [unbilledCosts] = await connection.query(
        'SELECT cost_id, amount FROM maintenance_costs WHERE request_id = ? AND invoice_id IS NULL',
        [requestId]
      );
      if (unbilledCosts.length === 0)
        throw new AppError('No unbilled costs found to invoice.', 400);

      const aggregatedTotalCents = unbilledCosts.reduce(
        (sum, cost) => sum + Number(cost.amount),
        0
      );
      const costIds = unbilledCosts.map((c) => c.cost_id);

      // 4. Create the Invoice record
      let proposedDescription =
        description || `Maintenance Bill: ${request.title}`;
      const invoiceId = await invoiceModel.create(
        {
          leaseId: targetLease.id,
          amount: aggregatedTotalCents,
          dueDate: dueDate || today(),
          description: proposedDescription,
          type: 'maintenance',
        },
        connection
      );

      // 5. Link costs to the new invoice
      if (costIds.length > 0) {
        await connection.query(
          'UPDATE maintenance_costs SET invoice_id = ?, is_reimbursable = TRUE WHERE cost_id IN (?)',
          [invoiceId, costIds]
        );
      }

      // 6. [SIDE EFFECT] Attempt to auto-apply any account credits
      await paymentService.applyTenantCredit(invoiceId, connection);

      await connection.commit();

      // 7. [SIDE EFFECT] Notify Tenant of the maintenance bill via notification and email
      const finalInvoice = await invoiceModel.findById(invoiceId);
      await notificationModel.create({
        userId: request.tenantId,
        message: `Billed LKR ${fromCents(aggregatedTotalCents)} for maintenance: ${request.title}${finalInvoice.status === 'paid' ? ' (Paid via Credit)' : ''}`,
        type: 'invoice',
        entityType: 'invoice',
        entityId: invoiceId,
      });

      try {
        const tenant = await userModel.findById(request.tenantId);
        if (tenant?.email) {
          await emailService.sendInvoiceNotification(tenant.email, {
            amount: fromCents(aggregatedTotalCents),
            dueDate: dueDate || today(),
            month: now().getMonth() + 1,
            year: now().getFullYear(),
            invoiceId,
            description: proposedDescription,
            isPaid: finalInvoice.status === 'paid',
          });
        }
      } catch (err) {
        console.error('Failed to send maintenance invoice email:', err);
      }

      return invoiceId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // RECORD COST: Specifically logs a material or labor expense for a repair job.
  async recordCost(data, user) {
    // 1. [SECURITY] RBAC check
    if (!authorizationService.isAtLeast(user.role, ROLES.TREASURER)) {
      throw new AppError(
        'Only Treasurers/Owners can record maintenance costs.',
        403
      );
    }

    const { requestId, amount, description, recordedDate, billTo } = data;
    const request = await maintenanceRequestModel.findById(requestId);
    if (!request) throw new AppError('Maintenance Request not found', 404);

    if (request.status === 'closed') {
      throw new AppError(
        'Cannot record costs for a closed maintenance request.',
        400
      );
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 2. Perform the cost insertion
      const costId = await maintenanceCostModel.create(
        {
          requestId,
          amount: Number(amount),
          description,
          recordedDate: recordedDate || getLocalTime(),
          invoiceId: data.invoiceId || null,
          isReimbursable: data.isReimbursable || false,
          billTo: billTo || ROLES.OWNER,
        },
        connection
      );

      // 3. Identify lease context for ledger and billing routing
      const targetLease = await this._getLeaseForRequest(requestId, connection);

      let generatedInvoiceId = null;

      if (targetLease) {
        // 4. [SIDE EFFECT] Create instant invoice if billTo = Tenant
        if (billTo === ROLES.TENANT) {
          const invoiceId = await invoiceModel.create(
            {
              leaseId: targetLease.id,
              amount: Number(amount),
              dueDate: formatToLocalDate(addDays(now(), 7)),
              description: `Maintenance charge: ${request.title}`,
              type: 'maintenance',
            },
            connection
          );
          generatedInvoiceId = invoiceId;
          await connection.query(
            'UPDATE maintenance_costs SET invoice_id = ?, is_reimbursable = TRUE WHERE cost_id = ?',
            [invoiceId, costId]
          );
          await notificationModel.create(
            {
              userId: targetLease.tenantId,
              message: `Maintenance charge LKR ${Number(amount).toFixed(2)} billed.`,
              type: 'invoice',
              entityType: 'invoice',
              entityId: invoiceId,
            },
            connection
          );
        }

        // 5. [AUDIT] Post to Ledger as an Expense (Category decided by billTo)
        await ledgerModel.create(
          {
            leaseId: targetLease.id,
            accountType: 'expense',
            category:
              billTo === ROLES.TENANT
                ? 'reimbursable_maintenance'
                : 'maintenance_repair',
            credit: Number(amount),
            description: `Maintenance Cost: ${description || request.title} (Req #${requestId})${billTo === ROLES.TENANT ? ' [REIMBURSABLE]' : ''}`,
            entryDate: recordedDate || getCurrentDateString(),
          },
          connection
        );
      } else {
        console.warn(
          `Maintenance Req #${requestId} cost recorded without an active lease link. Ledger skip.`
        );
      }

      await auditLogger.log(
        {
          userId: user.user_id || user.id,
          actionType: 'MAINTENANCE_COST_RECORDED',
          entityId: requestId,
          entityType: 'maintenance_request',
          details: { amount, description, costId },
        },
        null,
        connection
      );

      await connection.commit();

      // 6. [SIDE EFFECT] Notify Tenant if auto-billed
      if (generatedInvoiceId && targetLease) {
        try {
          const tenant = await userModel.findById(targetLease.tenantId);
          if (tenant?.email)
            await emailService.sendInvoiceNotification(tenant.email, {
              amount: Number(amount),
              dueDate: formatToLocalDate(addDays(now(), 7)),
              month: now().getMonth() + 1,
              year: now().getFullYear(),
              invoiceId: generatedInvoiceId,
              description: `Maintenance charge: ${request.title}`,
              isPaid: false,
            });
        } catch (err) {
          console.error('Failed to send maintenance invoice email:', err);
        }
      }

      return {
        costId,
        billingSuccess: !!(targetLease && billTo === ROLES.TENANT),
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * [NEW] Private Helper: Identify the correct lease for a maintenance request.
   * Prioritizes the lease that was active on the date the request was created.
   */
  // GET LEASE FOR REQUEST: Private Helper indicating which lease was active at time of job initiation.
  async _getLeaseForRequest(requestId, connection = null) {
    const request = await maintenanceRequestModel.findById(requestId);
    if (!request) return null;

    // Fetch all leases for the unit to find the chronological match
    const leases = await leaseModel.findByUnitId(request.unitId, connection);

    const requestDateString =
      request.createdAt instanceof Date
        ? request.createdAt.toISOString().split('T')[0]
        : new Date(request.createdAt).toISOString().split('T')[0];

    // Priority 1: Direct date match
    let targetLease = leases.find(
      (l) =>
        requestDateString >= l.startDate &&
        (!l.endDate || requestDateString <= l.endDate)
    );

    // Priority 2: Fallback to most recent lease
    if (!targetLease && leases.length > 0) targetLease = leases[0];

    return targetLease;
  }

  // GET REQUESTS: Fetches relevant jobs based on User role.
  async getRequests(user) {
    if (user.role === ROLES.SYSTEM)
      return await maintenanceRequestModel.findAll();
    if (user.role === ROLES.TENANT)
      return await maintenanceRequestModel.findByTenantId(user.id);
    if (user.role === ROLES.OWNER)
      return await maintenanceRequestModel.findByOwnerId(user.id);
    if (user.role === ROLES.TREASURER)
      return await maintenanceRequestModel.findByTreasurerId(user.id);
    throw new AppError('Access denied', 403);
  }
}

export default new MaintenanceService();
