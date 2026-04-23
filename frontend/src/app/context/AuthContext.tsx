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
  // 1. [STATE] Global Identity: Holds the verified user profile and session loading states
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 2. [STATE] Tenant Context: Manages units assigned to the user (supporting multi-unit occupants)
  const [tenantLeases, setTenantLeases] = useState<Lease[]>([]);
  const [activeLeaseId, setActiveLeaseIdState] = useState<string | null>(null);
  const [isLoadingLeases, setIsLoadingLeases] = useState(false);

  // 3. [REF] Lifecycle Management: Timer for automatic session invalidation
  const logoutTimerRef = useRef<number | null>(null);

  // SET ACTIVE LEASE: Switches the global context to a specific unit's view.
  const setActiveLeaseId = (id: string) => {
    // 1. [SYNC] Local State: Update transient UI state
    setActiveLeaseIdState(id);
    // 2. [PERSISTENCE] Local Storage: Ensure the choice survives page reloads
    storage.setActiveLeaseId(id);
  };

  // FETCH LEASES: Resolves all active contracts for a tenant to support unit switching.
  const fetchLeases = async (userId: string) => {
    try {
      setIsLoadingLeases(true);
      // 1. [API] Extraction: Fetch raw lease data from the backend
      const res = await leaseApi.getLeases();

      // 2. [TRANSFORMATION] Data Normalization: Converts cents values to UI-ready LKR numbers [E7/E19]
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

      // 3. [SYNC] Local State: Store the filtered list of managing units
      setTenantLeases(activeOnly);

      // 4. [LOGIC] Default Selection: Select active lease based on Persisted Preference > First Active > None
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

  // CLEAR LOGOUT TIMER: Cleanup routine to prevent memory leaks or incorrect logouts.
  const clearLogoutTimer = () => {
    if (logoutTimerRef.current) {
      window.clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
  };

  // SCHEDULE LOGOUT: Sets an automated trigger based on JWT expiration.
  const scheduleLogout = (remainingTime: number) => {
    // 1. [CLEANUP] Reset existing timers
    clearLogoutTimer();
    // 2. [LIFECYCLE] Timer Setup: triggers global logout when the clock runs out
    if (remainingTime > 0) {
      logoutTimerRef.current = window.setTimeout(() => {
        console.warn('Session expired. Logging out automatically.');
        logout();
      }, remainingTime);
    }
  };

  // LOGOUT: Full session teardown and identity clearing.
  const logout = async () => {
    // 1. [CLEANUP] Clear timers and storage tokens
    clearLogoutTimer();
    await authService.logout();
    // 2. [SYNC] Local State: Clear the user object to trigger UI redirects
    setUser(null);
  };

  // INITIALIZATION EFFECT: Hydrates the identity state on application load.
  useEffect(() => {
    const initAuth = async () => {
      // [M9] Use /auth/me to restore session from cookie
      try {
        const user = await authService.getMe();
        if (user) {
          setUser(user);
          // 2. [HYDRATION] Context Loading: Fetch leases if the user is a tenant
          if (user.role === 'tenant') {
            fetchLeases(user.id);
          }
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('[AuthContext] Initial session recovery failed:', err);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    return () => clearLogoutTimer();
  }, []);

  // LOGIN: Authenticates credentials and boots the user session.
  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      // 1. [API] Verification
      const { user } = await authService.login({ email, password });
      // 2. [SYNC] Local State
      setUser(user);
      // 3. [HYDRATION] Load situational context
      if (user.role === 'tenant') {
        await fetchLeases(user.id);
      }
      return true;
    } catch (error) {
      console.error('Login failed', error);
      throw error;
    }
  };

  // UPDATE PROFILE: Synchronizes local user state after a successful modification.
  const updateProfile = async (data: Partial<User>) => {
    try {
      const updatedUser = await authService.updateProfile(data);
      setUser((prev) => (prev ? { ...prev, ...updatedUser } : null));
    } catch (error) {
      console.error('Profile update failed', error);
      throw error;
    }
  };

  // CHANGE PASSWORD: Proxy for credential rotation.
  const changePassword = async (data: any) => {
    try {
      await authService.changePassword(data);
    } catch (error) {
      console.error('Password change failed', error);
      throw error;
    }
  };

  // REFRESH USER: Explicitly pulls the latest profile from the server.
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
