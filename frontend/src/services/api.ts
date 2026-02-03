// API configuration and axios instance
// This will be used for making HTTP requests to the backend

import axios from 'axios';

// Ensure this matches the backend URL
export const API_BASE_URL = 'http://localhost:3000/api';

export const apiClient = axios.create({
    baseURL: API_BASE_URL,
});

// Add request interceptor to include auth token
apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('authToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Add response interceptor to handle auth errors

apiClient.interceptors.response.use(
    (response) => response,
    (error: any) => {
        if (error.response && error.response.status === 401) {
            // Clear token if invalid/expired to prevent infinite loops of failed requests
            console.warn('Authentication failed (401), clearing token.');
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
            // Optional: Redirect to login
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// Maintenance API
export const maintenanceApi = {
    createRequest: (data: any) => apiClient.post('/maintenance-requests', data),
    getRequests: () => apiClient.get('/maintenance-requests'),
    updateStatus: (id: string, status: string) => apiClient.put(`/maintenance-requests/${id}/status`, { status }),

    addCost: (data: any) => apiClient.post('/maintenance-costs', data),
    getCosts: (requestId: string) => apiClient.get(`/maintenance-costs?requestId=${requestId}`),
    deleteCost: (id: string) => apiClient.delete(`/maintenance-costs/${id}`),
};

// Payment API
export const paymentApi = {
    submitPayment: (data: any) => apiClient.post('/payments', data),
    getPayments: () => apiClient.get('/payments'),
    verifyPayment: (id: string, status: string) => apiClient.put(`/payments/${id}/verify`, { status }),
    recordCashPayment: (invoiceId: string, amount: number, paymentDate: string, referenceNumber?: string) =>
        apiClient.post('/payments/cash', { invoiceId, amount, paymentDate, referenceNumber }),
};

// Notification API
export const notificationApi = {
    getNotifications: () => apiClient.get('/notifications'),
    markAsRead: (id: string) => apiClient.put(`/notifications/${id}/read`),
};

// Invoice API
export const invoiceApi = {
    getInvoices: () => apiClient.get('/invoices'),
    createInvoice: (data: any) => apiClient.post('/invoices', data),
    generateInvoices: (year?: number, month?: number) => apiClient.post('/invoices/generate', { year, month }),
};

export const payoutApi = {
    preview: (startDate: string, endDate: string) => apiClient.get(`/payouts/preview?startDate=${startDate}&endDate=${endDate}`),
    create: (data: { startDate: string; endDate: string }) => apiClient.post('/payouts/create', data),
    getHistory: () => apiClient.get('/payouts/history'),
};

export const auditApi = {
    getLogs: (limit = 50) => apiClient.get(`/audit-logs?limit=${limit}`),
};

export default apiClient;


