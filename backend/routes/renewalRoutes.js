import { Router } from 'express';
import renewalController from '../controllers/renewalController.js';
import {
  authenticateToken,
  authorizeRoles,
} from '../middleware/authMiddleware.js';
import { ROLES } from '../utils/roleUtils.js';
import validateRequest from '../middleware/validateRequest.js';
import { proposeTermsSchema } from '../schemas/renewalSchemas.js';

const router = Router();

// GET all renewal requests (scoped by role in the service layer)
router.get('/', authenticateToken, renewalController.getRequests);

// [S2 FIX] Staff-only: Propose new lease terms
// Added authorizeRoles + validateRequest to guard this financial action
router.post(
  '/:id/propose',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  validateRequest(proposeTermsSchema),
  renewalController.proposeTerms
);

// Tenant actions — intentionally open to tenants (no staff role guard)
router.post('/:id/accept', authenticateToken, renewalController.tenantAccept);
router.post('/:id/decline', authenticateToken, renewalController.tenantDecline);

// [S2 FIX] Staff-only: Final approval and rejection
// Added authorizeRoles to prevent tenants from approving their own renewals
router.post(
  '/:id/approve',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  renewalController.approveRenewal
);
router.post(
  '/:id/reject',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  renewalController.rejectRenewal
);

export default router;
