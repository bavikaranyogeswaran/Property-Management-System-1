import axios from 'axios';

const API_URL = 'http://localhost:3000/api/reports';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
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
  downloadFinancialReport: async (
    year: number = new Date().getFullYear(),
    action: 'view' | 'download' = 'view'
  ) => {
    try {
      const response = await axios.get(`${API_URL}/financial?year=${year}`, {
        headers: getAuthHeader(),
        responseType: 'blob',
      });
      handleResponse(response, `financial_report_${year}.pdf`, action);
      return true;
    } catch (error) {
      console.error('Action failed', error);
      throw error;
    }
  },

  downloadOccupancyReport: async (action: 'view' | 'download' = 'view') => {
    try {
      const response = await axios.get(`${API_URL}/occupancy`, {
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

  downloadTenantRiskReport: async (action: 'view' | 'download' = 'view') => {
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

  downloadMaintenanceReport: async (action: 'view' | 'download' = 'view') => {
    try {
      const response = await axios.get(`${API_URL}/maintenance`, {
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

  downloadLeaseReport: async (action: 'view' | 'download' = 'view') => {
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

  downloadLeadReport: async (action: 'view' | 'download' = 'view') => {
    try {
      const response = await axios.get(`${API_URL}/leads`, {
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
