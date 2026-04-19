// ============================================================================
//  LEASE SERVICE FACADE (The Main Hub)
// ============================================================================
//  This service is the main "reception desk" for everything lease-related.
//  It coordinates between specialized services that handle creation,
//  termination, billing, and refunds.
// ============================================================================

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

import LeaseCreationService from './leaseCreationService.js';
import LeaseTerminationService from './leaseTerminationService.js';
import LeaseRefundService from './leaseRefundService.js';
import LeaseBillingService from './leaseBillingService.js';
import LeaseSharedService from './leaseSharedService.js';

class LeaseService {
  constructor() {
    this.creationService = new LeaseCreationService(this);
    this.terminationService = new LeaseTerminationService(this);
    this.refundService = new LeaseRefundService(this);
    this.billingService = new LeaseBillingService(this);
    this.sharedService = new LeaseSharedService(this);
  }

  // CREATE LEASE: Delegates to Creation Service to start a new rental agreement.
  async createLease(data, connection, user) {
    return this.creationService.createLease(data, connection, user);
  }

  async verifyLeaseDocuments(leaseId, user) {
    return this.creationService.verifyLeaseDocuments(leaseId, user);
  }

  async rejectLeaseDocuments(leaseId, reason, user) {
    return this.creationService.rejectLeaseDocuments(leaseId, reason, user);
  }

  async signLease(leaseId, user, connection) {
    return this.creationService.signLease(leaseId, user, connection);
  }

  // TERMINATE LEASE: Delegates to Termination Service to end a contract.
  async terminateLease(leaseId, terminationDate, terminationFee, user) {
    return this.terminationService.terminateLease(
      leaseId,
      terminationDate,
      terminationFee,
      user
    );
  }

  async finalizeLeaseCheckout(leaseId, user) {
    return this.terminationService.finalizeLeaseCheckout(leaseId, user);
  }

  async cancelLease(leaseId, user) {
    return this.terminationService.cancelLease(leaseId, user);
  }

  async withdrawApplication(leaseId, user) {
    return this.terminationService.withdrawApplication(leaseId, user);
  }

  async processAutomatedEscalations() {
    return this.terminationService.processAutomatedEscalations();
  }

  async updateNoticeStatus(leaseId, status, user) {
    return this.terminationService.updateNoticeStatus(leaseId, status, user);
  }

  // REQUEST REFUND: Delegates to Refund Service to start the move-out money return.
  async requestRefund(leaseId, amount, notes, user) {
    return this.refundService.requestRefund(leaseId, amount, notes, user);
  }

  async approveRefund(leaseId, user) {
    return this.refundService.approveRefund(leaseId, user);
  }

  async confirmDisbursement(leaseId, data, user) {
    return this.refundService.confirmDisbursement(leaseId, data, user);
  }

  async disputeRefund(leaseId, notes, user) {
    return this.refundService.disputeRefund(leaseId, notes, user);
  }

  async acknowledgeRefund(leaseId, tenantId) {
    return this.refundService.acknowledgeRefund(leaseId, tenantId);
  }

  async resolveRefundDispute(leaseId, user, adjustedAmount) {
    return this.refundService.resolveRefundDispute(
      leaseId,
      user,
      adjustedAmount
    );
  }

  async refundDeposit(leaseId, amount, user) {
    return this.refundService.refundDeposit(leaseId, amount, user);
  }

  async addRentAdjustment(leaseId, data, user) {
    return this.billingService.addRentAdjustment(leaseId, data, user);
  }

  async getRentAdjustments(leaseId, user) {
    return this.billingService.getRentAdjustments(leaseId, user);
  }

  async getLeases(user) {
    return this.sharedService.getLeases(user);
  }

  async getLeaseById(id, user) {
    return this.sharedService.getLeaseById(id, user);
  }

  async _syncUnitStatus(unitId, connection) {
    return this.sharedService._syncUnitStatus(unitId, connection);
  }

  async updateLeaseDocument(id, documentUrl, user) {
    return this.sharedService.updateLeaseDocument(id, documentUrl, user);
  }

  async regenerateMagicLink(leaseId, user) {
    return this.sharedService.regenerateMagicLink(leaseId, user);
  }

  async getDepositStatus(leaseId) {
    return await leaseModel.getDepositStatus(leaseId);
  }
}

export default new LeaseService();
