import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type UserRole = 'owner' | 'tenant' | 'treasurer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string, role: UserRole) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  getTreasurers?: () => any[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock users for demonstration
const MOCK_USERS = [
  { id: '1', email: 'owner@pms.com', password: 'owner123', name: 'John Owner', role: 'owner' as UserRole },
  { id: '2', email: 'treasurer@pms.com', password: 'treasurer123', name: 'Jane Treasurer', role: 'treasurer' as UserRole },
  { id: '3', email: 'tenant@pms.com', password: 'tenant123', name: 'Bob Tenant', role: 'tenant' as UserRole },
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Check for stored user session
    const storedUser = localStorage.getItem('pms_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const login = async (email: string, password: string, role: UserRole): Promise<boolean> => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // First check mock users
    const foundUser = MOCK_USERS.find(
      u => u.email === email && u.password === password && u.role === role
    );

    if (foundUser) {
      const userData = {
        id: foundUser.id,
        email: foundUser.email,
        name: foundUser.name,
        role: foundUser.role,
      };
      setUser(userData);
      localStorage.setItem('pms_user', JSON.stringify(userData));
      return true;
    }

    // If role is treasurer, check registered treasurers from localStorage
    if (role === 'treasurer') {
      const storedData = localStorage.getItem('pms_data');
      if (storedData) {
        const data = JSON.parse(storedData);
        const treasurer = data.treasurers?.find(
          (t: any) => t.email === email && t.password === password && t.status === 'active'
        );
        
        if (treasurer) {
          const userData = {
            id: treasurer.id,
            email: treasurer.email,
            name: treasurer.name,
            role: 'treasurer' as UserRole,
          };
          setUser(userData);
          localStorage.setItem('pms_user', JSON.stringify(userData));
          return true;
        }
      }
    }

    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('pms_user');
  };

  return (
    <AuthContext.Provider value={{
      user,
      login,
      logout,
      isAuthenticated: !!user,
    }}>
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