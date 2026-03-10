// Authentication service
// Handles login, registration, and authentication state

import storage from './storage';

export interface LoginCredentials {
    email: string;
    password: string;
}

export interface RegisterData {
    email: string;
    password: string;
    name: string;
    role: 'owner' | 'tenant' | 'treasurer';
}

export const authService = {
    // Mock login - will be replaced with real API calls
    login: async (credentials: LoginCredentials) => {
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Mock user data based on email
        const mockUser = {
            id: '1',
            email: credentials.email,
            name: credentials.email.split('@')[0],
            role: credentials.email.includes('owner')
                ? 'owner'
                : credentials.email.includes('tenant')
                    ? 'tenant'
                    : 'treasurer',
        };

        const mockToken = 'mock-jwt-token-' + Date.now();

        storage.setToken(mockToken);
        storage.setUser(mockUser);

        return { user: mockUser, token: mockToken };
    },

    // Mock registration
    register: async (data: RegisterData) => {
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 500));

        const mockUser = {
            id: Date.now().toString(),
            email: data.email,
            name: data.name,
            role: data.role,
        };

        const mockToken = 'mock-jwt-token-' + Date.now();

        storage.setToken(mockToken);
        storage.setUser(mockUser);

        return { user: mockUser, token: mockToken };
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
