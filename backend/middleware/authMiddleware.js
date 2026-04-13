import jwt from 'jsonwebtoken';
import userModel from '../models/userModel.js';
import authorizationService from '../services/authorizationService.js';
import securityTokenService from '../services/securityTokenService.js';
import cacheService from '../services/cacheService.js';

const { verify } = jwt;

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = verify(token, process.env.JWT_SECRET);

    // [HARDENED] Session Cache Guard
    // Replaces redundant DB lookup on every request with Cache-Aside pattern.
    const user = await cacheService.getOrSet(
      cacheService.getUserKey(decoded.id),
      () => userModel.findById(decoded.id),
      300 // 5 Minute TTL
    );

    if (!user || user.status !== 'active' || user.is_archived) {
      console.warn(
        `[Auth] Revoked: User ${decoded.id} is blocked, archived, or inactive.`
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
        `[Auth] Revoked: Session version mismatch for User ${decoded.id}.`
      );
      return res.status(401).json({
        error:
          'Your session has been logged out by another security event. Please log in again.',
      });
    }

    // [HARDENED] Real-time Role Synchronization
    req.user = { ...decoded, role: user.role };
    next();
  } catch (err) {
    console.log('[Auth] Token verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const optionalAuthenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = verify(token, process.env.JWT_SECRET);

    // [HARDENED] Even in optional auth, we verify against the DB if a token is present.
    // This prevents "Ghost Access" where a blocked user appears authenticated on public pages.
    const user = await userModel.findById(decoded.id);

    if (!user || user.status !== 'active' || user.is_archived) {
      req.user = null; // Treat as guest if blocked/deleted
      return next();
    }

    if (user.tokenVersion !== (decoded.tokenVersion || 0)) {
      req.user = null; // Treat as guest if session revoked
      return next();
    }

    // [HARDENED] Real-time Role Synchronization
    req.user = { ...decoded, role: user.role };
    next();
  } catch (err) {
    // If token is malformed/expired, the user experience choice is to either reject (consistency)
    // or ignore (lax). Given the sensitive nature of roles, we reject to force a re-login.
    console.warn('[Auth] Optional Auth: Invalid token provided. Rejecting.');
    return res.status(401).json({
      error: 'Session expired or invalid token. Please log in again.',
    });
  }
};

export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // [HARDENED] Hierarchy-Aware Authorization
    // Instead of simple inclusion, we check if the user's role satisfies the required level
    const isAuthorized = roles.some((role) =>
      authorizationService.isAtLeast(req.user.role, role)
    );

    if (!isAuthorized) {
      return res.status(403).json({
        error: `Access denied. Required role level: ${roles.join(' or ')}`,
      });
    }
    next();
  };
};

/**
 * Centrally enforces resource-level authorization.
 * Wraps AuthorizationService into a reusable middleware.
 * [HARDENED]: Now requires explicit source binding (params, body, or query)
 * to prevent ID Pollution vulnerabilities. Defaults to 'params' for safety.
 *
 * @param {string} resourceType - The type of resource ('property', 'unit', 'lease', 'invoice', 'payment', 'maintenance_request')
 * @param {string} paramName - The name of the ID field in the request (default: 'id')
 * @param {string} source - The source of the ID (params, body, or query) (default: 'params')
 */
export const authorizeResource = (
  resourceType,
  paramName = 'id',
  source = 'params'
) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userId = req.user.id;
    const role = req.user.role;

    // [HARDENED] Strict source binding to prevent Parameter/ID Pollution
    const resourceId = req[source]?.[paramName];

    if (!resourceId) {
      console.error(
        `[Auth] Missing ${paramName} in req.${source} for ${resourceType} authorization.`
      );
      return res.status(400).json({
        error: `Missing required identity check: ${paramName} (expected in ${source})`,
      });
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
        case 'maintenance_request':
        case 'maintenanceRequest': // Keep backward compatibility for temporary internal calls if any
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
