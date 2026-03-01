import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import authService from '../../services/auth';

export type UserRole = 'owner' | 'tenant' | 'treasurer' | 'lead';

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  updateProfile: (data: Partial<User>) => Promise<void>;
  changePassword: (data: any) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const logoutTimerRef = useRef<number | null>(null);

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
