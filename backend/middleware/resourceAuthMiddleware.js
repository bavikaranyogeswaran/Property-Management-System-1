import authorizationService from '../services/authorizationService.js';

/**
 * authorizeResource Middleware Factory
 * 
 * Verifies that the authenticated user has access to the resource
 * identified by the given parameter name.
 * 
 * @param {string} entityType - The type of resource ('property', 'unit', 'lease', 'invoice', 'maintenance_request')
 * @param {string} [paramName='id'] - The name of the parameter in req.params containing the ID.
 */
export const authorizeResource = (entityType, paramName = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[paramName];
      const { user } = req;

      if (!resourceId) {
        return res.status(400).json({ error: `Missing resource identifier: ${paramName}` });
      }

      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      let hasAccess = false;

      switch (entityType) {
        case 'property':
          hasAccess = await authorizationService.canAccessProperty(user.id, user.role, resourceId);
          break;
        case 'unit':
          hasAccess = await authorizationService.canAccessUnit(user.id, user.role, resourceId);
          break;
        case 'lease':
          hasAccess = await authorizationService.canAccessLease(user.id, user.role, resourceId);
          break;
        case 'invoice':
          hasAccess = await authorizationService.canAccessInvoice(user.id, user.role, resourceId);
          break;
        case 'payment':
          hasAccess = await authorizationService.canAccessPayment(user.id, user.role, resourceId);
          break;
        case 'maintenance_request':
          hasAccess = await authorizationService.canAccessMaintenanceRequest(user.id, user.role, resourceId);
          break;
        default:
          console.error(`Invalid entity type passed to authorizeResource: ${entityType}`);
          return res.status(500).json({ error: 'Internal authorization error' });
      }

      if (!hasAccess) {
        console.warn(`[Auth] Access denied for User ${user.id} (${user.role}) trying to access ${entityType} ${resourceId}`);
        return res.status(403).json({ error: 'Access denied. You do not have permission to access/modify this resource.' });
      }

      next();
    } catch (error) {
      console.error('[Auth Middleware] Error:', error);
      res.status(500).json({ error: 'Authorization check failed' });
    }
  };
};
