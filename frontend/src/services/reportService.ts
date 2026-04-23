// ============================================================================
//  REPORT SERVICE (The Document Printer)
// ============================================================================
//  This file asks the server to generate PDF reports.
//  It handles downloading them or opening them in a new tab.
// ============================================================================

import apiClient from './api';

const handleResponse = (
  response: any,
  filename: string,
  action: 'view' | 'download'
) => {
  const url = window.URL.createObjectURL(
    new Blob([response.data], { type: 'application/pdf' })
  );
  if (action === 'view') {
    window.open(url, '_blank');
  } else {
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
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
      let url = `/reports/financial?year=${year}`;
      if (month) url += `&month=${month}`;

      const response = await apiClient.get(url, {
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
      let url = `/reports/occupancy?`;
      if (year) url += `year=${year}`;
      if (month) url += `&month=${month}`;

      const response = await apiClient.get(url, {
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
      const response = await apiClient.get(`/reports/tenant-risk`, {
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
      let url = `/reports/maintenance?year=${year}`;
      if (month) url += `&month=${month}`;

      const response = await apiClient.get(url, {
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
      const response = await apiClient.get(`/reports/leases`, {
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

      const response = await apiClient.get(`/reports/leads${queryString}`, {
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
