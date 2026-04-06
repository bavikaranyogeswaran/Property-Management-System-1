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
    const token = storage.getToken();
    if (!token) return false;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiry = payload.exp * 1000;

      if (Date.now() >= expiry) {
        storage.clear();
        return false;
      }
      return true;
    } catch (error) {
      storage.clear();
      return false;
    }
  },

  getTokenRemainingTime: () => {
    const token = storage.getToken();
    if (!token) return 0;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return Math.max(0, payload.exp * 1000 - Date.now());
    } catch (error) {
      return 0;
    }
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

  getProfile: async () => {
    try {
      const response = await apiClient.get('/users/profile');
      const user = response.data;
      if (user) {
        storage.setUser(user);
      }
      return user;
    } catch (error) {
      console.error('Fetch profile error:', error);
      throw error;
    }
  },

  verifyEmail: async (token: string) => {
    const response = await apiClient.post('/auth/verify-email', { token });
    return response.data;
  },

  setupPassword: async (token: string, password: string, tenantData?: any) => {
    let payload: any = { token, password };

    if (tenantData) {
      const { nicDoc, ...rest } = tenantData;
      if (nicDoc instanceof File) {
        const formData = new FormData();
        formData.append('token', token);
        formData.append('password', password);
        formData.append('tenantData', JSON.stringify(rest));
        formData.append('nicDoc', nicDoc);
        payload = formData;
      } else {
        payload.tenantData = tenantData;
      }
    }

    const response = await apiClient.post('/auth/setup-password', payload);
    return response.data;
  },
};

export default authService;
