import React, {
  createContext,
  useContext,
  useState,
  useEffect,
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
  updateProfile: (data: Partial<User>) => Promise<void>;
  changePassword: (data: any) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Check for stored user session
    const storedUser = authService.getCurrentUser();
    if (storedUser) {
      setUser(storedUser);
    }
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const { user } = await authService.login({ email, password });
      setUser(user);
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

  const logout = () => {
    authService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticated: !!user,
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
