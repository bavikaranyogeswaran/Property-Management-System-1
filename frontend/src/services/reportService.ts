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

export const reportService = {
    downloadFinancialReport: async (year: number = new Date().getFullYear()) => {
        try {
            const response = await axios.get(`${API_URL}/financial?year=${year}`, {
                headers: getAuthHeader(),
                responseType: 'blob'
            });
            downloadFile(response, `financial_report_${year}.pdf`);
            return true;
        } catch (error) {
            console.error('Download failed', error);
            throw error;
        }
    },

    downloadOccupancyReport: async () => {
        try {
            const response = await axios.get(`${API_URL}/occupancy`, {
                headers: getAuthHeader(),
                responseType: 'blob'
            });
            downloadFile(response, `occupancy_report.pdf`);
            return true;
        } catch (error) {
            console.error('Download failed', error);
            throw error;
        }
    },

    downloadTenantRiskReport: async () => {
        try {
            const response = await axios.get(`${API_URL}/tenant-risk`, {
                headers: getAuthHeader(),
                responseType: 'blob'
            });
            downloadFile(response, `tenant_risk_report.pdf`);
            return true;
        } catch (error) {
            console.error('Download failed', error);
            throw error;
        }
    }
};
