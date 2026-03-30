
import pool from '../config/db.js';
import invoiceModel from '../models/invoiceModel.js';
import maintenanceCostModel from '../models/maintenanceCostModel.js';
import unitModel from '../models/unitModel.js';
import leaseModel from '../models/leaseModel.js';
import leadModel from '../models/leadModel.js';
import ledgerModel from '../models/ledgerModel.js';
import { getLocalTime, parseLocalDate, addDays } from '../utils/dateUtils.js';

class ReportService {

    // Helper: Get property IDs accessible by a user based on role
    async _getAccessiblePropertyIds(user) {
        if (user.role === 'owner') {
            const [rows] = await pool.query(
                'SELECT property_id FROM properties WHERE owner_id = ?',
                [user.id]
            );
            return rows.map(r => r.property_id);
        }
        if (user.role === 'treasurer') {
            const [rows] = await pool.query(
                'SELECT property_id FROM staff_property_assignments WHERE user_id = ?',
                [user.id]
            );
            return rows.map(r => r.property_id);
        }
        return [];
    }

    async getFinancialStats(year, user) {
        const propertyIds = await this._getAccessiblePropertyIds(user);
        if (propertyIds.length === 0) return {};

        // Try ledger-based reporting first
        const ledgerSummary = await ledgerModel.getSummaryByProperty(propertyIds, year);
        const hasLedgerData = Object.keys(ledgerSummary).length > 0;

        if (hasLedgerData) {
            // Ledger-based: accurate revenue vs liability vs expense
            const propertyStats = {};
            for (const [name, data] of Object.entries(ledgerSummary)) {
                propertyStats[name] = {
                    income: data.revenue,           // Only real revenue (rent + late fees)
                    depositsHeld: data.liabilityHeld - data.liabilityRefunded,
                    expense: data.expense,
                };
            }

            // Also include maintenance costs not yet in ledger
            const [costs] = await pool.query(
                `SELECT mc.*, p.name as property_name
                 FROM maintenance_costs mc
                 JOIN maintenance_requests mr ON mc.request_id = mr.request_id
                 JOIN units u ON mr.unit_id = u.unit_id
                 JOIN properties p ON u.property_id = p.property_id
                 WHERE YEAR(mc.recorded_date) = ?
                 AND p.property_id IN (?)`,
                [year, propertyIds]
            );
            costs.forEach((cost) => {
                const name = cost.property_name || 'Unknown Property';
                if (!propertyStats[name]) propertyStats[name] = { income: 0, depositsHeld: 0, expense: 0 };
                propertyStats[name].expense += Number(cost.amount);
            });

            return propertyStats;
        }

        // Fallback: Optimized invoice-based approach
        const invoiceStats = await invoiceModel.getFinancialStatsByYear(year);
        const costStats = await maintenanceCostModel.getFinancialStatsByYear(year);

        const propertyStats = {};
        
        // Filter by accessible properties
        invoiceStats.filter(s => propertyIds.includes(Number(s.property_id))).forEach(s => {
             const name = s.property_name || 'Unknown Property';
             if (!propertyStats[name]) propertyStats[name] = { income: 0, expense: 0, depositsHeld: 0 };
             propertyStats[name].income += Number(s.total_income);
        });

        costStats.filter(s => propertyIds.includes(Number(s.property_id))).forEach(s => {
             const name = s.property_name || 'Unknown Property';
             if (!propertyStats[name]) propertyStats[name] = { income: 0, expense: 0, depositsHeld: 0 };
             propertyStats[name].expense += Number(s.total_expense);
        });

        return propertyStats;
    }

    /**
     * Get a comprehensive ledger summary for a given year.
     * Returns totals for revenue, liabilities, expenses and net operating income.
     */
    async getLedgerSummary(year, user) {
        const propertyIds = await this._getAccessiblePropertyIds(user);
        return await ledgerModel.getYearlySummary(propertyIds, year);
    }

    async getOccupancyStats(user) {
        const propertyIds = await this._getAccessiblePropertyIds(user);
        if (propertyIds.length === 0) return {};

        // Fetch pre-aggregated occupancy data from DB, scoped to accessible properties
        const propertyStats = await unitModel.getOccupancyStats(propertyIds);
        return propertyStats;
    }

    async getTenantRiskStats(user) {
        const propertyIds = await this._getAccessiblePropertyIds(user);
        if (propertyIds.length === 0) return [];

        // Fetch tenant risk profiles scoped to the user's properties
        const [tenants] = await pool.query(
            `SELECT u.name, t.behavior_score,
                    (SELECT COUNT(*) FROM rent_invoices ri 
                     JOIN leases l2 ON ri.lease_id = l2.lease_id 
                     WHERE l2.tenant_id = t.user_id AND ri.status = 'overdue') as overdue_count,
                    (SELECT COUNT(*) FROM rent_invoices ri 
                     JOIN leases l2 ON ri.lease_id = l2.lease_id 
                     WHERE l2.tenant_id = t.user_id AND ri.status = 'paid') as paid_count
             FROM tenants t
             JOIN users u ON t.user_id = u.user_id
             JOIN leases l ON t.user_id = l.tenant_id
             JOIN units un ON l.unit_id = un.unit_id
             WHERE un.property_id IN (?)
             AND l.status = 'active'
             GROUP BY t.user_id, u.name, t.behavior_score`,
            [propertyIds]
        );

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

    async getMaintenanceCategoryStats(user) {
        const propertyIds = await this._getAccessiblePropertyIds(user);
        if (propertyIds.length === 0) return { categories: {}, totalCost: 0 };

        const [costs] = await pool.query(
            `SELECT mc.*, mr.title, p.name as property_name
             FROM maintenance_costs mc
             JOIN maintenance_requests mr ON mc.request_id = mr.request_id
             JOIN units u ON mr.unit_id = u.unit_id
             JOIN properties p ON u.property_id = p.property_id
             WHERE p.property_id IN (?)
             ORDER BY mc.recorded_date DESC`,
            [propertyIds]
        );

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

    async getLeaseExpirationStats(user) {
        const propertyIds = await this._getAccessiblePropertyIds(user);
        if (propertyIds.length === 0) return [];

        const activeLeases = await leaseModel.findActive();
        const nowTime = getLocalTime();
        const ninetyDaysFromNow = addDays(nowTime, 90);

        return activeLeases.filter((lease) => {
            // Filter by accessible properties
            if (!propertyIds.includes(Number(lease.propertyId))) return false;
            const endDate = parseLocalDate(lease.endDate);
            return endDate >= nowTime && endDate <= ninetyDaysFromNow;
        });
    }

    async getLeadConversionStats(user) {
        // Fetch pre-aggregated values from DB to avoid O(N) memory allocation and processing
        const stats = await leadModel.getLeadConversionStats();
        return {
            Total: Number(stats.Total),
            Interested: Number(stats.Interested),
            Converted: Number(stats.Converted),
            Dropped: Number(stats.Dropped)
        };
    }

    async getMonthlyCashFlow(user) {
        const propertyIds = await this._getAccessiblePropertyIds(user);
        if (propertyIds.length === 0) return [];

        const stats = await ledgerModel.getMonthlyStats(propertyIds, 12);
        return stats;
    }
}

export default new ReportService();
