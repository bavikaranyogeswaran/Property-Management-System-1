// ============================================================================
//  AUTH CONTEXT (The Identity Guard)
// ============================================================================
//  This is the source of truth for who is logged in.
//  It holds the User profile, handles the logout timers, and manages
//  the "Active Lease" context for tenants with multiple rooms.
// ============================================================================

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import authService from '../../services/auth';
import { leaseApi } from '../../services/api';
import storage from '../../services/storage';
import { Lease } from './AppContext';
import { toLKRFromCents } from '../../utils/formatters';

export type UserRole = 'owner' | 'tenant' | 'treasurer' | 'lead';

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  // Tenant Specific Fields (E7)
  permanentAddress?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  employmentStatus?: string;
  nic?: string;
  monthlyIncome?: number;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  updateProfile: (data: Partial<User>) => Promise<void>;
  changePassword: (data: any) => Promise<void>;
  refreshUser: () => Promise<void>;

  // Multi-Unit (E19)
  tenantLeases: Lease[];
  activeLeaseId: string | null;
  setActiveLeaseId: (id: string) => void;
  isLoadingLeases: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tenantLeases, setTenantLeases] = useState<Lease[]>([]);
  const [activeLeaseId, setActiveLeaseIdState] = useState<string | null>(null);
  const [isLoadingLeases, setIsLoadingLeases] = useState(false);
  const logoutTimerRef = useRef<number | null>(null);

  const setActiveLeaseId = (id: string) => {
    setActiveLeaseIdState(id);
    storage.setActiveLeaseId(id);
  };

  const fetchLeases = async (userId: string) => {
    try {
      setIsLoadingLeases(true);
      const res = await leaseApi.getLeases();
      console.log(
        '[AuthContext] Fetched leases, normalizing amounts...',
        res.data
      );
      const activeOnly = res.data
        .map((l: any) => ({
          ...l,
          id: String(l.id),
          unitId: String(l.unitId),
          tenantId: String(l.tenantId),
          monthlyRent: toLKRFromCents(l.monthlyRent),
          targetDeposit: toLKRFromCents(l.targetDeposit || 0),
          currentDepositBalance: toLKRFromCents(l.currentDepositBalance || 0),
          proposedRefundAmount: toLKRFromCents(l.proposedRefundAmount || 0),
          refundedAmount: toLKRFromCents(l.refundedAmount || 0),
        }))
        .filter(
          (l: Lease) =>
            l.status === 'active' ||
            l.status === 'draft' ||
            l.status === 'pending'
        );
      setTenantLeases(activeOnly);

      // Select active lease: Persisted > First Active > First found
      const storedId = storage.getActiveLeaseId();
      if (storedId && activeOnly.some((l: any) => l.id === storedId)) {
        setActiveLeaseIdState(storedId);
      } else if (activeOnly.length > 0) {
        setActiveLeaseId(activeOnly[0].id);
      }
    } catch (err) {
      console.error('[AuthContext] Failed to fetch tenant leases:', err);
    } finally {
      setIsLoadingLeases(false);
    }
  };

  const clearLogoutTimer = () => {
    if (logoutTimerRef.current) {
      window.clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
  };

  const scheduleLogout = (remainingTime: number) => {
    clearLogoutTimer();
    if (remainingTime > 0) {
      logoutTimerRef.current = window.setTimeout(() => {
        console.warn('Session expired. Logging out automatically.');
        logout();
      }, remainingTime);
    }
  };

  const logout = () => {
    clearLogoutTimer();
    authService.logout();
    setUser(null);
  };

  useEffect(() => {
    const initAuth = () => {
      const storedUser = authService.getCurrentUser();
      const isAuth = authService.isAuthenticated();

      if (storedUser && isAuth) {
        setUser(storedUser);
        const remainingTime = authService.getTokenRemainingTime();
        scheduleLogout(remainingTime);

        if (storedUser.role === 'tenant') {
          fetchLeases(storedUser.id);
        }

        // Sync with backend to ensure the local user data is not stale
        authService
          .getProfile()
          .then((user) => {
            if (user) {
              setUser(user);
              if (user.role === 'tenant' && tenantLeases.length === 0)
                fetchLeases(user.id);
            }
          })
          .catch((err) => {
            console.error('[AuthContext] Initial sync failed:', err);
            // If 401, the interceptor will handle it, otherwise keep local for now
          });
      } else {
        if (storedUser) {
          authService.logout();
          setUser(null);
        }
      }
      setIsLoading(false);
    };

    initAuth();

    return () => clearLogoutTimer();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const { user } = await authService.login({ email, password });
      setUser(user);
      if (user.role === 'tenant') {
        await fetchLeases(user.id);
      }
      const remainingTime = authService.getTokenRemainingTime();
      scheduleLogout(remainingTime);
      return true;
    } catch (error) {
      console.error('Login failed', error);
      throw error;
    }
  };

  const updateProfile = async (data: Partial<User>) => {
    try {
      const updatedUser = await authService.updateProfile(data);
      setUser((prev) => (prev ? { ...prev, ...updatedUser } : null));
    } catch (error) {
      console.error('Profile update failed', error);
      throw error;
    }
  };

  const changePassword = async (data: any) => {
    try {
      await authService.changePassword(data);
    } catch (error) {
      console.error('Password change failed', error);
      throw error;
    }
  };

  const refreshUser = async () => {
    try {
      const user = await authService.getProfile();
      if (user) {
        setUser(user);
      }
    } catch (error) {
      console.error('Profile refresh failed', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticated: !!user,
        isLoading,
        updateProfile,
        changePassword,
        refreshUser,
        tenantLeases,
        activeLeaseId,
        setActiveLeaseId,
        isLoadingLeases,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
