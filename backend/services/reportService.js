
import invoiceModel from '../models/invoiceModel.js';
import maintenanceCostModel from '../models/maintenanceCostModel.js';
import unitModel from '../models/unitModel.js';
import leaseModel from '../models/leaseModel.js';
import leadModel from '../models/leadModel.js';
import tenantModel from '../models/tenantModel.js';

class ReportService {

    async getFinancialStats(year) {
        const invoices = await invoiceModel.findAll();
        const costs = await maintenanceCostModel.findAllWithDetails();

        const paidInvoices = invoices.filter(
            (i) => i.status === 'paid' && new Date(i.due_date).getFullYear() == year
        );

        const yearCosts = costs.filter(
            (c) => new Date(c.recorded_date).getFullYear() == year
        );

        const propertyStats = {};
        
        // Helper to init
        const getStat = (name) => {
             if (!propertyStats[name]) propertyStats[name] = { income: 0, expense: 0 };
             return propertyStats[name];
        };

        paidInvoices.forEach((inv) => {
            const name = inv.property_name || 'Unknown Property';
            getStat(name).income += Number(inv.amount);
        });

        yearCosts.forEach((cost) => {
            const name = cost.property_name || 'Unknown Property';
            getStat(name).expense += Number(cost.amount);
        });
        
        return propertyStats;
    }

    async getOccupancyStats() {
        const units = await unitModel.findAll();
        const propertyStats = {};

        for (const unit of units) {
            const propName = unit.property_name || `Property ${unit.property_id}`;
            if (!propertyStats[propName]) {
                propertyStats[propName] = { total: 0, occupied: 0, vacancies: [] };
            }

            propertyStats[propName].total++;
            if (unit.status === 'occupied') {
                propertyStats[propName].occupied++;
            } else {
                propertyStats[propName].vacancies.push(unit.unit_number);
            }
        }
        return propertyStats;
    }

    async getTenantRiskStats() {
        const tenants = await tenantModel.getTenantRiskProfiles();
        // Enrich with Risk Level
        return tenants.map(tenant => {
            let riskLevel = 'Low';
            let color = 'green';

            if (tenant.behavior_score < 70 || tenant.overdue_count > 1) {
                riskLevel = 'Medium';
                color = 'orange';
            }
            if (tenant.behavior_score < 50 || tenant.overdue_count > 3) {
                riskLevel = 'High';
                color = 'red';
            }
            return { ...tenant, riskLevel, color };
        });
    }

    async getMaintenanceCategoryStats() {
        const costs = await maintenanceCostModel.findAllWithDetails();
        const categories = {};
        let totalCost = 0;

        costs.forEach((cost) => {
            const text = (cost.description + ' ' + (cost.title || '')).toLowerCase();
            let category = 'General';

            if (text.includes('water') || text.includes('leak') || text.includes('plumb') || text.includes('pipe')) category = 'Plumbing';
            else if (text.includes('electric') || text.includes('light') || text.includes('power') || text.includes('wire')) category = 'Electrical';
            else if (text.includes('ac') || text.includes('air') || text.includes('heat') || text.includes('cool') || text.includes('hvac')) category = 'HVAC';
            else if (text.includes('paint') || text.includes('wall')) category = 'Painting';
            else if (text.includes('clean') || text.includes('trash')) category = 'Cleaning';
            else if (text.includes('door') || text.includes('lock') || text.includes('key')) category = 'Security';

            if (!categories[category]) categories[category] = 0;
            categories[category] += Number(cost.amount);
            totalCost += Number(cost.amount);
        });

        return { categories, totalCost };
    }

    async getLeaseExpirationStats() {
        const activeLeases = await leaseModel.findActive();
        const now = new Date();
        const ninetyDaysFromNow = new Date();
        ninetyDaysFromNow.setDate(now.getDate() + 90);

        return activeLeases.filter((lease) => {
            const endDate = new Date(lease.endDate);
            return endDate >= now && endDate <= ninetyDaysFromNow;
        });
    }

    async getLeadConversionStats() {
        const leads = await leadModel.findAll();
        const stats = {
            Total: leads.length,
            Interested: 0,
            Scheduled: 0,
            visited: 0, 
            Application: 0,
            Leased: 0,
        };

        leads.forEach((lead) => {
            const status = lead.status.toLowerCase();
            if (status === 'interested' || status === 'new') stats.Interested++;
            if (status.includes('schedule') || status.includes('visit')) stats.Scheduled++;
            if (status.includes('application') || status === 'applied') stats.Application++;
            if (status === 'converted' || status === 'leased' || status === 'tenant') stats.Leased++;
        });
        
        return stats;
    }
}

export default new ReportService();
