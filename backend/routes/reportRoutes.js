import express from 'express';
import reportController from '../controllers/reportController.js';
import {
  authenticateToken,
  authorizeRoles,
} from '../middleware/authMiddleware.js';
import { ROLES } from '../utils/roleUtils.js';

const router = express.Router();

// Only Owners and Treasurers can generate reports?
// Or mainly Owner. Let's allow Owner and Treasurer.
router.get(
  '/financial',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  reportController.generateFinancialReport
);
router.get(
  '/occupancy',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  reportController.generateOccupancyReport
);
router.get(
  '/tenant-risk',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  reportController.generateTenantRiskReport
);
router.get(
  '/maintenance',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  reportController.generateMaintenanceCategoryReport
);
router.get(
  '/leases',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  reportController.generateLeaseExpirationReport
);
router.get(
  '/leads',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  reportController.generateLeadConversionReport
);
router.get(
  '/ledger-summary',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  reportController.getLedgerSummary
);
router.get(
  '/cash-flow',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  reportController.getMonthlyCashFlow
);

export default router;
