import { Router } from 'express';
import propertyController from '../controllers/propertyController.js';
import {
  authenticateToken,
  authorizeRoles,
  authorizeResource,
  optionalAuthenticateToken,
} from '../middleware/authMiddleware.js';

import upload from '../middleware/upload.js';

import validateRequest from '../middleware/validateRequest.js';
import {
  propertySchema,
  updatePropertySchema,
} from '../schemas/propertySchemas.js';

const router = Router();

// Types (Public)
router.get('/types', propertyController.getPropertyTypes);

// CRUD
// GET / - Public listing of all properties (but contextual if auth)
router.get('/', optionalAuthenticateToken, propertyController.getProperties);

// POST / - Owner only
router.post(
  '/',
  authenticateToken,
  authorizeRoles('owner'),
  validateRequest(propertySchema),
  propertyController.createProperty
);

// GET /:id - Allow all users (public)
router.get(
  '/:id',
  optionalAuthenticateToken,
  propertyController.getPropertyById
);
router.get('/:id/lease-terms', propertyController.getLeaseTermsByPropertyId);

// PUT /:id - Owner only (with ownership check)
router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('owner'),
  authorizeResource('property', 'id', 'params'),
  validateRequest(updatePropertySchema),
  propertyController.updateProperty
);

// DELETE /:id - Owner only (with ownership check)
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles('owner'),
  authorizeResource('property', 'id', 'params'),
  propertyController.deleteProperty
);

// POST /:id/images - Upload images (with ownership check)
router.post(
  '/:id/images',
  authenticateToken,
  authorizeRoles('owner'),
  authorizeResource('property', 'id', 'params'),
  upload.array('images', 10),
  propertyController.uploadImages
);

export default router;
