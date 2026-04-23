// ============================================================================
//  API SERVICE (The Messenger)
// ============================================================================
//  This file is the specific phone line that calls the Backend.
//  It knows where the server is and attaches the Security Badge (Token)
//  to every message for secure communication.
// ============================================================================

// API configuration and axios instance
// This will be used for making HTTP requests to the backend

import axios from 'axios';

// Ensure this matches the backend URL
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // [M9] Allow sending cookies with requests
});

// Add request interceptor (Legacy support for Authorization header if still needed, but cookies take precedence)
apiClient.interceptors.request.use(
  (config) => {
    // [M9] The browser automatically sends the HTTP-only cookie now.
    // We keep this for any manual token usage or transitional grace period.
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add response interceptor to handle auth errors and transient failures
apiClient.interceptors.response.use(
  (response) => response,
  async (error: any) => {
    const { config, response } = error;

    // 1. [S8 FIX] Fail-fast Retry Mechanism
    // If the error is transient (502, 503, 504 or timeout) and we haven't reached retry limit
    const MAX_RETRIES = 3;
    config._retryCount = config._retryCount || 0;

    const isTransientError =
      !response ||
      [502, 503, 504].includes(response.status) ||
      error.code === 'ECONNABORTED';

    if (isTransientError && config._retryCount < MAX_RETRIES) {
      config._retryCount++;
      const delay = Math.pow(2, config._retryCount) * 1000; // Exponential backoff: 2s, 4s, 8s

      console.warn(
        `Transient error (${response?.status || error.code}). Retrying request (${config._retryCount}/${MAX_RETRIES}) in ${delay}ms: ${config.url}`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      return apiClient(config);
    }

    // 2. Handle Authentication Errors (401)
    if (response && response.status === 401) {
      const url = config?.url || '';
      const isLoginRequest = url.includes('auth/login');
      const isMeRequest = url.includes('auth/me');
      const isPublicPath = window.location.pathname === '/login';

      if (!isLoginRequest && !isMeRequest && !isPublicPath) {
        console.warn(
          'Authentication failed (401), clearing token and redirecting to login.'
        );
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }

    // 403 = valid token but insufficient role permissions — let component handle it
    return Promise.reject(error);
  }
);

// Maintenance API
export const maintenanceApi = {
  createRequest: (data: any) => apiClient.post('/maintenance-requests', data),
  getRequests: () => apiClient.get('/maintenance-requests'),
  updateStatus: (id: string, status: string) =>
    apiClient.put(`/maintenance-requests/${id}/status`, { status }),

  addCost: (data: any) => apiClient.post('/maintenance-costs', data),
  getCosts: (requestId: string) =>
    apiClient.get(`/maintenance-costs?requestId=${requestId}`),
  deleteCost: (id: string) => apiClient.delete(`/maintenance-costs/${id}`),
  createInvoice: (data: {
    requestId: string;
    amount: number;
    description: string;
    dueDate?: string;
  }) => apiClient.post('/maintenance-requests/invoice', data),
};

// Payment API
export const paymentApi = {
  submitPayment: (data: any, headers = {}) =>
    apiClient.post('/payments', data, {
      headers: {
        'Content-Type':
          data instanceof FormData ? 'multipart/form-data' : 'application/json',
        ...headers,
      },
    }),
  getPayments: () => apiClient.get('/payments'),
  verifyPayment: (id: string, status: string) =>
    apiClient.put(`/payments/${id}/verify`, { status }),
};

// Notification API
export const notificationApi = {
  getNotifications: () => apiClient.get('/notifications'),
  markAsRead: (id: string) => apiClient.put(`/notifications/${id}/read`),
  markAllAsRead: () => apiClient.put('/notifications/read-all'),
};

// Invoice API
export const invoiceApi = {
  getInvoices: () => apiClient.get('/invoices'),
  createInvoice: (data: any) => apiClient.post('/invoices', data),
  generateInvoices: (year?: number, month?: number) =>
    apiClient.post('/invoices/generate', { year, month }),
};

export const payoutApi = {
  preview: (
    ownerId: string,
    startDate: string,
    endDate: string,
    selection?: { incomeIds?: string[]; expenseIds?: string[] }
  ) => {
    let url = `/payouts/preview?ownerId=${ownerId}&startDate=${startDate}&endDate=${endDate}`;
    if (selection?.incomeIds?.length) {
      selection.incomeIds.forEach((id) => (url += `&incomeIds=${id}`));
    }
    if (selection?.expenseIds?.length) {
      selection.expenseIds.forEach((id) => (url += `&expenseIds=${id}`));
    }
    return apiClient.get(url);
  },
  create: (data: {
    ownerId: string;
    startDate: string;
    endDate: string;
    selection?: { incomeIds?: string[]; expenseIds?: string[] };
  }) => apiClient.post('/payouts/create', data),
  getHistory: (ownerId?: string) =>
    apiClient.get(`/payouts/history${ownerId ? `?ownerId=${ownerId}` : ''}`),
  markAsPaid: (
    id: string,
    data: { bankReference: string; proofUrl?: string }
  ) => apiClient.put(`/payouts/${id}/paid`, data),
  acknowledge: (id: string) => apiClient.put(`/payouts/${id}/acknowledge`),
  dispute: (id: string, reason: string) =>
    apiClient.put(`/payouts/${id}/dispute`, { reason }),
  getDetails: (id: string) => apiClient.get(`/payouts/${id}/details`),
  exportCSV: (id: string) =>
    apiClient.get(`/payouts/${id}/export`, { responseType: 'blob' }),
};

export const auditApi = {
  getLogs: (limit = 50) => apiClient.get(`/audit-logs?limit=${limit}`),
};

// User API
export const userApi = {
  getProfile: () => apiClient.get('/users/profile'),
  updateProfile: (data: any) => apiClient.put('/users/profile', data),
  getUserById: (id: string) => apiClient.get(`/users/${id}`),
};

// Lease API
export const leaseApi = {
  getLeases: () => apiClient.get('/leases'),
  getById: (id: string) => apiClient.get(`/leases/${id}`),
  updateNotice: (id: string, status: string) =>
    apiClient.patch(`/leases/${id}/notice-status`, { status }),
  getDepositStatus: (id: string) =>
    apiClient.get(`/leases/${id}/deposit-status`),
};

// Receipts
export const receiptApi = {
  getReceipts: () => apiClient.get('/receipts'),
  getReceiptById: (id: string) => apiClient.get(`/receipts/${id}`),
};

// Admin API
export const adminApi = {
  triggerLateFees: () => apiClient.post('/admin/trigger-late-fees'),
};

// Guest / Public API (No Auth Token Required)
export const guestApi = {
  getInvoiceDetails: (token: string) =>
    apiClient.get(`/public/invoice/${token}`),
  submitPayment: (token: string, data: FormData) =>
    apiClient.post(`/public/invoice/${token}/submit`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  getOnboardingStatus: (token: string) =>
    apiClient.get(`/public/invoice/${token}/onboarding-status`),
  getActivationStatus: (token: string) =>
    apiClient.get(`/public/invoice/${token}/status`),
};

export const messageApi = {
  // Owner endpoints
  getLeadMessages: (leadId: string) => apiClient.get(`/messages/${leadId}`),
  sendLeadMessage: (leadId: string, content: string) =>
    apiClient.post(`/messages/${leadId}`, { content }),
  markLeadRead: (leadId: string) => apiClient.put(`/messages/${leadId}/read`),

  getTenantMessages: (tenantId: string) =>
    apiClient.get(`/messages/owner/tenant/${tenantId}`),
  sendTenantMessage: (tenantId: string, content: string) =>
    apiClient.post(`/messages/owner/tenant/${tenantId}`, { content }),
  markTenantRead: (tenantId: string) =>
    apiClient.put(`/messages/owner/tenant/${tenantId}/read`),

  // Tenant endpoints (The tenant views their own thread)
  getMyThread: () => apiClient.get('/messages/tenant/thread'),
  sendToOwner: (content: string) =>
    apiClient.post('/messages/tenant/thread', { content }),
  markMyThreadRead: () => apiClient.put('/messages/tenant/thread/read'),
};

export default apiClient;
