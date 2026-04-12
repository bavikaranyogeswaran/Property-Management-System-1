import crypto, { randomUUID } from 'crypto';
import leaseModel from '../models/leaseModel.js';
import unitModel from '../models/unitModel.js';
import tenantModel from '../models/tenantModel.js';
import pool from '../config/db.js';
import invoiceModel from '../models/invoiceModel.js';
import visitModel from '../models/visitModel.js';
import leadModel from '../models/leadModel.js';
import { validateLeaseDuration } from '../utils/validators.js';
import {
  getCurrentDateString,
  getLocalTime,
  today,
  parseLocalDate,
  addDays,
  formatToLocalDate,
  getDaysInMonth,
} from '../utils/dateUtils.js';
import { toCentsFromMajor, moneyMath, fromCents } from '../utils/moneyUtils.js';
import renewalService from './renewalService.js';
import auditLogger from '../utils/auditLogger.js';

class LeaseBillingService {
  constructor(facade) {
    this.facade = facade;
  }

  async addRentAdjustment(leaseId, data, user) {
    const lease = await this.facade.getLeaseById(leaseId, user);
    if (!lease) throw new Error('Lease not found');
    if (user.role !== 'owner')
      throw new Error(
        'Access denied: Only owners can perform rent adjustments'
      );

    const { effectiveDate, newMonthlyRent, notes } = data;
    const start = parseLocalDate(lease.startDate);
    const eff = parseLocalDate(effectiveDate);

    if (eff < start)
      throw new Error('Adjustment date cannot be before lease start');
    if (lease.endDate && eff > parseLocalDate(lease.endDate))
      throw new Error('Adjustment date cannot be after lease end');

    // [HARDENED] Input is now sanitized to cents at the controller.
    const newRentCents = newMonthlyRent;

    const adjustmentId = await leaseModel.createAdjustment({
      leaseId,
      effectiveDate,
      newMonthlyRent: newRentCents,
      notes,
    });

    await auditLogger.log({
      userId: user.id || user.user_id,
      actionType: 'LEASE_RENT_ADJUSTED',
      entityId: leaseId,
      entityType: 'lease',
      details: { adjustmentId, newMonthlyRent, effectiveDate },
    });

    return adjustmentId;
  }

  async getRentAdjustments(leaseId, user) {
    const lease = await this.facade.getLeaseById(leaseId, user);
    if (!lease) throw new Error('Lease not found');
    return await leaseModel.findAdjustmentsByLeaseId(leaseId);
  }
}

export default LeaseBillingService;
