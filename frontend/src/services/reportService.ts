// ============================================================================
//  REPORT SERVICE (The Document Printer)
// ============================================================================
//  This file asks the server to generate PDF reports.
//  It handles downloading them or opening them in a new tab.
// ============================================================================

import axios from 'axios';

const API_URL = 'http://localhost:3000/api/reports';

const getAuthHeader = () => {
  const token = localStorage.getItem('authToken');
  return { Authorization: `Bearer ${token}` };
};

const downloadFile = (response: any, filename: string) => {
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const openInNewTab = (response: any) => {
  const url = window.URL.createObjectURL(
    new Blob([response.data], { type: 'application/pdf' })
  );
  window.open(url, '_blank');
};

const handleResponse = (
  response: any,
  filename: string,
  action: 'view' | 'download'
) => {
  if (action === 'view') {
    openInNewTab(response);
  } else {
    downloadFile(response, filename);
  }
};

export const reportService = {
  downloadFinancialReport: async (options: {
    year?: number;
    month?: number;
    action?: 'view' | 'download';
  }) => {
    const { year = new Date().getFullYear(), month, action = 'view' } = options;
    try {
      let url = `${API_URL}/financial?year=${year}`;
      if (month) url += `&month=${month}`;

      const response = await axios.get(url, {
        headers: getAuthHeader(),
        responseType: 'blob',
      });
      handleResponse(
        response,
        `financial_report_${year}_${month || 'full'}.pdf`,
        action
      );
      return true;
    } catch (error) {
      console.error('Action failed', error);
      throw error;
    }
  },

  downloadOccupancyReport: async (options: {
    year?: number;
    month?: number;
    action?: 'view' | 'download';
  }) => {
    const { year, month, action = 'view' } = options;
    try {
      let url = `${API_URL}/occupancy?`;
      if (year) url += `year=${year}`;
      if (month) url += `&month=${month}`;

      const response = await axios.get(url, {
        headers: getAuthHeader(),
        responseType: 'blob',
      });
      handleResponse(response, `occupancy_report.pdf`, action);
      return true;
    } catch (error) {
      console.error('Action failed', error);
      throw error;
    }
  },

  downloadTenantRiskReport: async (options: {
    action?: 'view' | 'download';
  }) => {
    const { action = 'view' } = options;
    try {
      const response = await axios.get(`${API_URL}/tenant-risk`, {
        headers: getAuthHeader(),
        responseType: 'blob',
      });
      handleResponse(response, `tenant_risk_report.pdf`, action);
      return true;
    } catch (error) {
      console.error('Action failed', error);
      throw error;
    }
  },

  downloadMaintenanceReport: async (options: {
    year?: number;
    month?: number;
    action?: 'view' | 'download';
  }) => {
    const { year = new Date().getFullYear(), month, action = 'view' } = options;
    try {
      let url = `${API_URL}/maintenance?year=${year}`;
      if (month) url += `&month=${month}`;

      const response = await axios.get(url, {
        headers: getAuthHeader(),
        responseType: 'blob',
      });
      handleResponse(response, `maintenance_category_report.pdf`, action);
      return true;
    } catch (error) {
      console.error('Action failed', error);
      throw error;
    }
  },

  downloadLeaseReport: async (options: { action?: 'view' | 'download' }) => {
    const { action = 'view' } = options;
    try {
      const response = await axios.get(`${API_URL}/leases`, {
        headers: getAuthHeader(),
        responseType: 'blob',
      });
      handleResponse(response, `lease_expiration_forecast.pdf`, action);
      return true;
    } catch (error) {
      console.error('Action failed', error);
      throw error;
    }
  },

  downloadLeadReport: async (options: {
    year?: number;
    month?: number;
    action?: 'view' | 'download';
  }) => {
    const { year, month, action = 'view' } = options;
    try {
      let query = [];
      if (year) query.push(`year=${year}`);
      if (month) query.push(`month=${month}`);
      const queryString = query.length > 0 ? `?${query.join('&')}` : '';

      const response = await axios.get(`${API_URL}/leads${queryString}`, {
        headers: getAuthHeader(),
        responseType: 'blob',
      });
      handleResponse(response, `lead_conversion_report.pdf`, action);
      return true;
    } catch (error) {
      console.error('Action failed', error);
      throw error;
    }
  },
};
