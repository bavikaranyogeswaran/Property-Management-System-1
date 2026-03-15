import { Router } from 'express';
import propertyController from '../controllers/propertyController.js';
import authenticateToken, {
  authorizeRoles,
  optionalAuthenticateToken,
} from '../middleware/authMiddleware.js';
import upload from '../middleware/upload.js';

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
  propertyController.createProperty
);

// GET /:id - Allow all users (public)
router.get('/:id', optionalAuthenticateToken, propertyController.getPropertyById);
router.get('/:id/lease-terms', propertyController.getLeaseTermsByPropertyId);

// PUT /:id - Owner only
router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('owner'),
  propertyController.updateProperty
);

// DELETE /:id - Owner only
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles('owner'),
  propertyController.deleteProperty
);

// POST /:id/images - Upload images
router.post(
  '/:id/images',
  authenticateToken,
  authorizeRoles('owner'),
  upload.array('images', 10),
  propertyController.uploadImages
);

export default router;
