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

  // CREATE LEASE: Initiates a new digital tenancy agreement.
  async createLease(data, connection, user) {
    // 1. [DELEGATION] CreationService: Handles property/unit validation, deposit calculation, and record initialization.
    return this.creationService.createLease(data, connection, user);
  }

  // VERIFY DOCUMENTS: Review and accept tenant KYC/identity uploads.
  async verifyLeaseDocuments(leaseId, user) {
    // 1. [DELEGATION] CreationService: Marks docs as verified and transitions lease toward 'pending_payment'.
    return this.creationService.verifyLeaseDocuments(leaseId, user);
  }

  // REJECT DOCUMENTS: Flags tenant uploads as insufficient or invalid.
  async rejectLeaseDocuments(leaseId, reason, user) {
    // 1. [DELEGATION] CreationService: Reverts lease to 'draft' and attaches rejection notes for tenant correction.
    return this.creationService.rejectLeaseDocuments(leaseId, reason, user);
  }

  // SIGN LEASE: Executes digital signatures for the contract.
  async signLease(leaseId, user, connection) {
    // 1. [DELEGATION] CreationService: Updates signature timestamps and moves lease to 'active' or 'pending_payment'.
    return this.creationService.signLease(leaseId, user, connection);
  }

  // TERMINATE LEASE: Initiates the legal end of a tenancy.
  async terminateLease(leaseId, terminationDate, terminationFee, user) {
    // 1. [DELEGATION] TerminationService: Sets move-out dates, calculates penalties, and orphans any future rent invoices.
    return this.terminationService.terminateLease(
      leaseId,
      terminationDate,
      terminationFee,
      user
    );
  }

  // FINALIZE CHECKOUT: Confirms physical unit vacancy and key handover.
  async finalizeLeaseCheckout(leaseId, user) {
    // 1. [DELEGATION] TerminationService: Marks tenancy as 'finished' and triggers maintenance if required.
    return this.terminationService.finalizeLeaseCheckout(leaseId, user);
  }

  // CANCEL LEASE: Aborts a lease before it begins.
  async cancelLease(leaseId, user) {
    // 1. [DELEGATION] TerminationService: Rolls back unit locks and voids initial deposit requirements.
    return this.terminationService.cancelLease(leaseId, user);
  }

  // WITHDRAW APPLICATION: Tenant-driven cancellation of a draft lease.
  async withdrawApplication(leaseId, user) {
    // 1. [DELEGATION] TerminationService: Safely removes applicant from the unit waitlist.
    return this.terminationService.withdrawApplication(leaseId, user);
  }

  // AUTOMATED ESCALATIONS: Nightly job to progress leases past notice/expiry dates.
  async processAutomatedEscalations() {
    // 1. [DELEGATION] TerminationService: Identifies expired leases and moves them to 'past_notice' or 'terminated'.
    return this.terminationService.processAutomatedEscalations();
  }

  // UPDATE NOTICE STATUS: Formally records a Move-out Notice from a tenant.
  async updateNoticeStatus(leaseId, status, user) {
    // 1. [DELEGATION] TerminationService: Transitions lease to 'notice_given'.
    return this.terminationService.updateNoticeStatus(leaseId, status, user);
  }

  // REQUEST REFUND: Submits a deposit return request after lease end.
  async requestRefund(leaseId, amount, notes, user) {
    // 1. [DELEGATION] RefundService: Calculates offsets (damage/debt) and creates a pending refund record.
    return this.refundService.requestRefund(leaseId, amount, notes, user);
  }

  // APPROVE REFUND: Owner/Staff confirmation of the refund amount.
  async approveRefund(leaseId, user) {
    // 1. [DELEGATION] RefundService: Transitions refund to 'approved' state, ready for bank payout.
    return this.refundService.approveRefund(leaseId, user);
  }

  // CONFIRM DISBURSEMENT: Treasurer confirmation that funds have left the agency account.
  async confirmDisbursement(leaseId, data, user) {
    // 1. [DELEGATION] RefundService: Records bank reference and closes the refund cycle.
    return this.refundService.confirmDisbursement(leaseId, data, user);
  }

  // DISPUTE REFUND: Tenant challenge of the proposed refund amount.
  async disputeRefund(leaseId, notes, user) {
    // 1. [DELEGATION] RefundService: Flags refund for arbitration review.
    return this.refundService.disputeRefund(leaseId, notes, user);
  }

  // ACKNOWLEDGE REFUND: Tenant confirmation of payment receipt.
  async acknowledgeRefund(leaseId, tenantId) {
    // 1. [DELEGATION] RefundService: Final archival of the refund record.
    return this.refundService.acknowledgeRefund(leaseId, tenantId);
  }

  // RESOLVE DISPUTE: Final arbitration settlement for a contested refund.
  async resolveRefundDispute(leaseId, user, adjustedAmount) {
    // 1. [DELEGATION] RefundService: Atomic adjustment and re-approval of the refund amount.
    return this.refundService.resolveRefundDispute(
      leaseId,
      user,
      adjustedAmount
    );
  }

  // FULL REFUND: Shortcut for returning entire deposit without deductions.
  async refundDeposit(leaseId, amount, user) {
    // 1. [DELEGATION] RefundService: Standard refund flow with zero offsets.
    return this.refundService.refundDeposit(leaseId, amount, user);
  }

  // ADD ADJUSTMENT: Manual modification to current rent (e.g., utility recharge or discount).
  async addRentAdjustment(leaseId, data, user) {
    // 1. [DELEGATION] BillingService: Schedules a variance for the next automated invoice cycle.
    return this.billingService.addRentAdjustment(leaseId, data, user);
  }

  // GET ADJUSTMENTS: List all scheduled variations for the lease.
  async getRentAdjustments(leaseId, user) {
    // 1. [DELEGATION] BillingService: Fetches Constituent adjustments.
    return this.billingService.getRentAdjustments(leaseId, user);
  }

  // GET LEASES: Portfolio listing engine with RBAC filtering.
  async getLeases(user) {
    // 1. [DELEGATION] SharedService: Returns scoped leases based on Owner/Staff permissions.
    return this.sharedService.getLeases(user);
  }

  // GET BY ID: Detailed hydration of a single lease and its financial constituents.
  async getLeaseById(id, user) {
    // 1. [DELEGATION] SharedService: Fetches lease meta-data, unit details, and current balances.
    return this.sharedService.getLeaseById(id, user);
  }

  // SYNC UNIT: Internal helper to reconcile unit availability with lease states.
  async _syncUnitStatus(unitId, connection) {
    // 1. [DELEGATION] SharedService: Recalculates unit status based on 'active' or 'pending' records.
    return this.sharedService._syncUnitStatus(unitId, connection);
  }

  // UPDATE DOCUMENT: Attaches a PDF/signed scan to the lease record.
  async updateLeaseDocument(id, documentUrl, user) {
    // 1. [DELEGATION] SharedService: Asset update for the legal agreement file.
    return this.sharedService.updateLeaseDocument(id, documentUrl, user);
  }

  // REGENERATE LINK: Issues a new secure magic link (e.g., if previous expired).
  async regenerateMagicLink(leaseId, user) {
    // 1. [DELEGATION] SharedService: Generates a new secure token for PayHere checkout.
    return this.sharedService.regenerateMagicLink(leaseId, user);
  }

  // DEPOSIT STATUS: Resolves the balance and status of the security deposit.
  async getDepositStatus(leaseId) {
    // 1. Simple model resolver for financial constituent status.
    return await leaseModel.getDepositStatus(leaseId);
  }
}

export default new LeaseService();
