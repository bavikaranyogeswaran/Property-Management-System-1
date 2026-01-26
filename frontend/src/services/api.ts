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
};

// Invoice API
export const invoiceApi = {
    getInvoices: () => apiClient.get('/invoices'),
    createInvoice: (data: any) => apiClient.post('/invoices', data),
};

export default apiClient;


