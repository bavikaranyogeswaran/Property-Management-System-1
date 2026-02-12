import express from 'express';
import reportController from '../controllers/reportController.js';
import authenticateToken, {
  authorizeRoles,
} from '../middleware/authMiddleware.js';

const router = express.Router();

// Only Owners and Treasurers can generate reports?
// Or mainly Owner. Let's allow Owner and Treasurer.
router.get(
  '/financial',
  authenticateToken,
  authorizeRoles('owner', 'treasurer'),
  reportController.generateFinancialReport
);
router.get(
  '/occupancy',
  authenticateToken,
  authorizeRoles('owner', 'treasurer'),
  reportController.generateOccupancyReport
);
router.get(
  '/tenant-risk',
  authenticateToken,
  authorizeRoles('owner', 'treasurer'),
  reportController.generateTenantRiskReport
);
router.get(
  '/maintenance',
  authenticateToken,
  authorizeRoles('owner', 'treasurer'),
  reportController.generateMaintenanceCategoryReport
);
router.get(
  '/leases',
  authenticateToken,
  authorizeRoles('owner', 'treasurer'),
  reportController.generateLeaseExpirationReport
);
router.get(
  '/leads',
  authenticateToken,
  authorizeRoles('owner', 'treasurer'),
  reportController.generateLeadConversionReport
);

export default router;
