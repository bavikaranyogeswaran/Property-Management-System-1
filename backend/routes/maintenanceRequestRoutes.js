import { Router } from 'express';
import maintenanceRequestController from '../controllers/maintenanceRequestController.js';
import {
  authenticateToken,
  authorizeResource,
  authorizeRoles,
} from '../middleware/authMiddleware.js';
import { ROLES } from '../utils/roleUtils.js';

import upload from '../middleware/upload.js';

const router = Router();

router.post(
  '/',
  authenticateToken,
  upload.array('images', 5),
  maintenanceRequestController.createRequest
);
router.get('/', authenticateToken, maintenanceRequestController.getRequests);
router.put(
  '/:id/status',
  authenticateToken,
  authorizeResource('maintenance_request', 'id', 'params'),
  maintenanceRequestController.updateStatus
);
router.post(
  '/invoice',
  authenticateToken,
  authorizeRoles(ROLES.OWNER, ROLES.TREASURER),
  maintenanceRequestController.createInvoice
);

export default router;
