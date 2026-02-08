import jwt from 'jsonwebtoken';
const { verify } = jwt;

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
        if (err) {
            console.log('[Auth] Token verification failed:', err.message);
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        console.log('[Auth] Authenticated user:', user.id, user.role);
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

    verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
        if (err) {
            // Token invalid/expired - treat as unauthenticated or error?
            // For optional, usually we can just ignore and treat as public, 
            // but if the client SENT a token, they probably expect it to work or fail.
            // Let's log and treat as unauthenticated to avoid blocking public page access due to stale token.
            console.log("Optional Auth: Invalid token, proceeding as guest.");
            req.user = null;
        } else {
            req.user = user;
        }
        next();
    });
};


export const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        console.log('[Auth] Checking roles:', roles, 'User role:', req.user?.role);
        if (!req.user || !roles.includes(req.user.role)) {
            console.log('[Auth] Access denied. User:', req.user);
            return res.status(403).json({ error: 'Access denied' });
        }
        next();
    };
};

export default authenticateToken;
