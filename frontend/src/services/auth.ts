import storage from './storage';
import { apiClient } from './api';

export interface LoginCredentials {
  email: string;
  password: string;
}

// ============================================================================
//  AUTH SERVICE (The Login Helper)
// ============================================================================
//  This file handles the actual Login process.
//  It sends the Email/Password to the server and saves the "Key" (Token) if valid.
// ============================================================================

export const authService = {
  // Real login with backend
  login: async (credentials: LoginCredentials) => {
    try {
      const response = await apiClient.post('/auth/login', credentials);
      const { token, user } = response.data;

      if (token && user) {
        storage.setToken(token);
        storage.setUser(user);
        return { token, user };
      }
      throw new Error('Invalid response from server');
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  },

  // Logout
  logout: () => {
    storage.clear();
  },

  // Get current user from storage
  getCurrentUser: () => {
    return storage.getUser();
  },

  // Check if user is authenticated
  isAuthenticated: () => {
    return !!storage.getToken();
  },

  // Password Reset
  forgotPassword: async (email: string) => {
    const response = await apiClient.post('/auth/forgot-password', { email });
    return response.data;
  },

  resetPassword: async (token: string, newPassword: string) => {
    const response = await apiClient.post('/auth/reset-password', {
      token,
      newPassword,
    });
    return response.data;
  },

  updateProfile: async (data: any) => {
    const response = await apiClient.put('/users/profile', data);
    // Update local storage if user details changed
    const currentUser = storage.getUser();
    if (currentUser) {
      const updatedUser = { ...currentUser, ...response.data };
      storage.setUser(updatedUser);
    }
    return response.data;
  },

  changePassword: async (data: any) => {
    const response = await apiClient.post('/auth/change-password', data);
    return response.data;
  },

  verifyEmail: async (token: string) => {
    const response = await apiClient.post('/auth/verify-email', { token });
    return response.data;
  },

  setupPassword: async (token: string, password: string) => {
    const response = await apiClient.post('/auth/setup-password', {
      token,
      password,
    });
    return response.data;
  },
};

export default authService;
