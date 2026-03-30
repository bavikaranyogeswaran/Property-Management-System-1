import jwt from 'jsonwebtoken';
const { verify } = jwt;

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.log('[Auth] Token verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
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
      return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
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
      return res.status(403).json({ error: `Access denied. Required role: ${roles.join(' or ')}` });
    }
    next();
  };
};

