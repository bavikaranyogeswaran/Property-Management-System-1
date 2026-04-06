import { Router } from 'express';
import maintenanceRequestController from '../controllers/maintenanceRequestController.js';
import {
  authenticateToken,
  authorizeResource,
} from '../middleware/authMiddleware.js';

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
  maintenanceRequestController.createInvoice
);

export default router;
