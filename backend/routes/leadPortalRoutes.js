import express from 'express';
import leadPortalController from '../controllers/leadPortalController.js';

const router = express.Router();

// All routes are PUBLIC (no JWT required) — they use token query param for auth

// GET /api/lead-portal?token=xxx — Lead profile + property + unit details
router.get('/', leadPortalController.getPortalData);

// GET /api/lead-portal/messages?token=xxx — Chat messages
router.get('/messages', leadPortalController.getMessages);

// POST /api/lead-portal/messages?token=xxx — Send a message
router.post('/messages', leadPortalController.sendMessage);

export default router;
