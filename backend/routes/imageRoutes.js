import { Router } from 'express';
import imageController from '../controllers/imageController.js';
import authenticateToken, { authorizeRoles } from '../middleware/authMiddleware.js';
import upload from '../middleware/upload.js';

const router = Router();

// All image routes require authentication and owner role
router.use(authenticateToken, authorizeRoles('owner'));

// Property Images
router.post('/properties/:propertyId/images', upload.array('images', 10), imageController.uploadPropertyImages);
router.get('/properties/:propertyId/images', imageController.getPropertyImages);
router.put('/properties/:propertyId/images/:imageId/primary', imageController.setPropertyPrimaryImage);
router.delete('/properties/images/:imageId', imageController.deletePropertyImage);

// Unit Images
router.post('/units/:unitId/images', upload.array('images', 10), imageController.uploadUnitImages);
router.get('/units/:unitId/images', imageController.getUnitImages);
router.put('/units/:unitId/images/:imageId/primary', imageController.setUnitPrimaryImage);
router.delete('/units/images/:imageId', imageController.deleteUnitImage);

export default router;
