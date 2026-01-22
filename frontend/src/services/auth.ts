import storage from './storage';
import { apiClient } from './api';

export interface LoginCredentials {
    email: string;
    password: string;
}

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
};

export default authService;
