import { Router } from 'express';
import maintenanceRequestController from '../controllers/maintenanceRequestController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { authorizeResource } from '../middleware/resourceAuthMiddleware.js';
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
  authorizeResource('maintenance_request'),
  maintenanceRequestController.updateStatus
);
router.post(
  '/invoice',
  authenticateToken,
  maintenanceRequestController.createInvoice
);

export default router;
