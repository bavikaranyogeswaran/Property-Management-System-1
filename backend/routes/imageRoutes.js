import { Router } from 'express';
import imageController from '../controllers/imageController.js';
import {
  authenticateToken,
  authorizeRoles,
} from '../middleware/authMiddleware.js';
import upload from '../middleware/upload.js';

const router = Router();

// Public Routes (No Auth)
router.get('/properties/:propertyId/images', imageController.getPropertyImages);
router.get('/units/:unitId/images', imageController.getUnitImages);

// General purpose file upload route (Protected)
router.use(authenticateToken);
router.post(
  '/upload',
  upload.single('file'),
  imageController.uploadGeneralFile
);

import { privateUpload } from '../middleware/upload.js';
router.post(
  '/upload/private',
  privateUpload.single('file'),
  imageController.uploadGeneralFile
);

// Protected Routes (Owner Only)
router.use(authorizeRoles('owner'));

// Property Images (Write)
router.post(
  '/properties/:propertyId/images',
  upload.array('images', 10),
  imageController.uploadPropertyImages
);
router.put(
  '/properties/:propertyId/images/:imageId/primary',
  imageController.setPropertyPrimaryImage
);
router.delete(
  '/properties/images/:imageId',
  imageController.deletePropertyImage
);

// Unit Images (Write)
router.post(
  '/units/:unitId/images',
  upload.array('images', 10),
  imageController.uploadUnitImages
);
router.put(
  '/units/:unitId/images/:imageId/primary',
  imageController.setUnitPrimaryImage
);
router.delete('/units/images/:imageId', imageController.deleteUnitImage);

export default router;
