import jwt from 'jsonwebtoken';
import userModel from '../models/userModel.js';
import authorizationService from '../services/authorizationService.js';
const { verify } = jwt;

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = verify(token, process.env.JWT_SECRET);

    // Revocation Guard: Check server-side status
    const user = await userModel.findById(decoded.id);

    if (!user || user.status !== 'active' || user.is_archived) {
      console.warn(
        `[Auth] Revoked: User ${decoded.id} is blocked, archived, or inactive (Status: ${user?.status}, Archived: ${user?.is_archived}).`
      );
      return res.status(401).json({
        error:
          'Account disabled, archived, or deleted. Please contact support.',
      });
    }

    // [HARDENED] Strict Session Revocation Check
    const currentTokenVersion = decoded.tokenVersion || 0;
    if (user.tokenVersion !== currentTokenVersion) {
      console.warn(
        `[Auth] Revoked: Session version mismatch for User ${decoded.id} (${user.tokenVersion} vs ${currentTokenVersion}).`
      );
      return res.status(401).json({
        error:
          'Your session has been logged out by another security event (e.g., password change). Please log in again.',
      });
    }

    // [HARDENED] Real-time Role Synchronization
    // We overwrite the role from the JWT with the fresh role from the database.
    // This ensures that demotions or promotions are instant, even with a long-lived token.
    req.user = { ...decoded, role: user.role };
    next();
  } catch (err) {
    console.log('[Auth] Token verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const optionalAuthenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      // If a token was provided but is invalid/expired, return 401
      // instead of silently failing and treating as guest.
      console.warn('[Auth] Optional Auth: Invalid token provided. Rejecting.');
      return res.status(401).json({
        error: 'Session expired or invalid token. Please log in again.',
      });
    }
    req.user = user;
    next();
  });
};

export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    // console.log('[Auth] Checking roles:', roles, 'User role:', req.user?.role);
    if (!req.user || !roles.includes(req.user.role)) {
      console.log('[Auth] Access denied. User:', req.user);
      return res
        .status(403)
        .json({ error: `Access denied. Required role: ${roles.join(' or ')}` });
    }
    next();
  };
};

/**
 * Centrally enforces resource-level authorization.
 * Wraps AuthorizationService into a reusable middleware.
 * Expects resource ID in req.params.id or req.params[paramName].
 */
export const authorizeResource = (resourceType, paramName = 'id') => {
  return async (req, res, next) => {
    const userId = req.user.id;
    const role = req.user.role;
    const resourceId = req.params[paramName];

    if (!resourceId) {
      console.error(
        `[Auth] Missing ${paramName} for ${resourceType} authorization.`
      );
      return res
        .status(400)
        .json({ error: 'System error: Identity check failed (Missing ID).' });
    }

    let authorized = false;
    try {
      switch (resourceType) {
        case 'property':
          authorized = await authorizationService.canAccessProperty(
            userId,
            role,
            resourceId
          );
          break;
        case 'unit':
          authorized = await authorizationService.canAccessUnit(
            userId,
            role,
            resourceId
          );
          break;
        case 'lease':
          authorized = await authorizationService.canAccessLease(
            userId,
            role,
            resourceId
          );
          break;
        case 'invoice':
          authorized = await authorizationService.canAccessInvoice(
            userId,
            role,
            resourceId
          );
          break;
        case 'payment':
          authorized = await authorizationService.canAccessPayment(
            userId,
            role,
            resourceId
          );
          break;
        case 'maintenanceRequest':
          authorized = await authorizationService.canAccessMaintenanceRequest(
            userId,
            role,
            resourceId
          );
          break;
        default:
          throw new Error(
            `Unsupported resource type for authorization: ${resourceType}`
          );
      }

      if (!authorized) {
        console.warn(
          `[Auth] Forbidden: User ${userId} (${role}) denied access to ${resourceType} #${resourceId}.`
        );
        return res.status(403).json({
          error:
            'Access denied. You do not have permission to access this resource.',
        });
      }

      next();
    } catch (err) {
      console.error(
        `[Auth] Exception during ${resourceType} authorization:`,
        err.message
      );
      return res
        .status(500)
        .json({ error: 'Internal system error during authorization.' });
    }
  };
};
