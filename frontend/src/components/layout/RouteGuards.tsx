import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../app/context/AuthContext';
import { AppLayout } from './AppLayout';

interface RouteGuardProps {
  children: React.ReactNode;
}

interface RoleRouteProps extends RouteGuardProps {
  allowedRoles: string[];
}

/**
 * Ensures the user is logged in before allowing access.
 * Redirects to /login if unauthorized.
 */
export function ProtectedRoute({ children }: RouteGuardProps) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

/**
 * Ensures the user has one of the required roles.
 * Redirects to /dashboard if unauthorized.
 */
export function RoleRoute({ children, allowedRoles }: RoleRouteProps) {
  const { user } = useAuth();
  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
