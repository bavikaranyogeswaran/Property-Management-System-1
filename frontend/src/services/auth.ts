import storage from './storage';
import { apiClient } from './api';

export interface LoginCredentials {
  email: string;
  password: string;
}

// ============================================================================
//  AUTH SERVICE (The Security Desk)
// ============================================================================
//  Handles the low-level communication for logins, logout, token storage,
//  and password resets.
// ============================================================================

export const authService = {
  // Real login with backend
  login: async (credentials: LoginCredentials) => {
    try {
      const response = await apiClient.post('/auth/login', credentials);
      const { user } = response.data;

      if (user) {
        storage.setUser(user);
        return { user };
      }
      throw new Error('Invalid response from server');
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  },

  // Logout: Informs the server to clear the session cookie
  logout: async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch (err) {
      console.warn('Backend logout failed', err);
    }
    storage.clear();
  },

  // Get current user from storage
  getCurrentUser: () => {
    return storage.getUser();
  },

  // Check if user is authenticated (Check for local user object as a hint,
  // but the real source of truth is the HTTP-only cookie and the /me endpoint)
  isAuthenticated: () => {
    return !!storage.getUser();
  },

  // [REMOVED] Token remaining time is not accessible from client-side for HTTP-only cookies
  getTokenRemainingTime: () => {
    return 0;
  },

  // Fetch current user from /me (Backend cookie check)
  getMe: async () => {
    try {
      const response = await apiClient.get('/auth/me');
      const { user } = response.data;
      if (user) {
        storage.setUser(user);
      }
      return user;
    } catch (error) {
      storage.clear();
      return null;
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
