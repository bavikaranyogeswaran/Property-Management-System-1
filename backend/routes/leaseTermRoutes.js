import express from 'express';
import leaseTermController from '../controllers/leaseTermController.js';
import { authenticateToken, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// All lease term routes are for owners
router.use(authenticateToken);
router.use(authorizeRoles('owner'));

router.get('/', leaseTermController.getLeaseTerms);
router.post('/', leaseTermController.createLeaseTerm);
router.put('/:id', leaseTermController.updateLeaseTerm);
router.delete('/:id', leaseTermController.deleteLeaseTerm);

export default router;
