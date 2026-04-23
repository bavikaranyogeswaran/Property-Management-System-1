// ============================================================================
//  REPORT SERVICE (The Statistician)
// ============================================================================
//  This service calculates all the numbers for reports.
//  It aggregates data from multiple tables to provide a "Big Picture" view
//  of financial health, occupancy, and tenant behavior.
// ============================================================================

import pool from '../config/db.js';
import invoiceModel from '../models/invoiceModel.js';
import maintenanceCostModel from '../models/maintenanceCostModel.js';
import unitModel from '../models/unitModel.js';
import leaseModel from '../models/leaseModel.js';
import leadModel from '../models/leadModel.js';
import ledgerModel from '../models/ledgerModel.js';
import { getLocalTime, parseLocalDate, addDays } from '../utils/dateUtils.js';
import { moneyMath, fromCents } from '../utils/moneyUtils.js';
import { ROLES } from '../utils/roleUtils.js';

class ReportService {
  // HELPER: Resolves the list of Property IDs the user has legal access to view based on their Role/Assignment.
  async _getAccessiblePropertyIds(user) {
    if (user.role === ROLES.SYSTEM) {
      const [rows] = await pool.query('SELECT property_id FROM properties');
      return rows.map((r) => r.property_id);
    }
    if (user.role === ROLES.OWNER) {
      const [rows] = await pool.query(
        'SELECT property_id FROM properties WHERE owner_id = ?',
        [user.id]
      );
      return rows.map((r) => r.property_id);
    }
    if (user.role === ROLES.TREASURER) {
      const [rows] = await pool.query(
        'SELECT property_id FROM staff_property_assignments WHERE user_id = ?',
        [user.id]
      );
      return rows.map((r) => r.property_id);
    }
    return [];
  }

  // GET FINANCIAL STATS: High-performance aggregation of income and expenses.
  async getFinancialStats(year, user, startDate = null, endDate = null) {
    // 1. [SECURITY] Identify accessible scope
    const propertyIds = await this._getAccessiblePropertyIds(user);
    if (propertyIds.length === 0) return {};

    // 2. Data Strategy: Prefer Ledger entries (Real-money) over Invoice entries (Accrual)
    const ledgerSummary = await ledgerModel.getSummaryByProperty(
      propertyIds,
      year,
      startDate,
      endDate
    );
    const hasLedgerData = Object.keys(ledgerSummary).length > 0;
    const propertyStats = {};

    if (hasLedgerData) {
      // 3. Process Ledger data: Summate revenue vs expenses per property
      for (const [name, data] of Object.entries(ledgerSummary)) {
        propertyStats[name] = {
          income: data.revenue,
          depositsHeld: data.liabilityHeld - data.liabilityRefunded,
          expense: data.expense,
        };
      }

      // 4. Augment with non-ledger maintenance costs for real-time accuracy
      let costQuery = `SELECT mc.*, p.name as property_name FROM maintenance_costs mc JOIN maintenance_requests mr ON mc.request_id = mr.request_id JOIN units u ON mr.unit_id = u.unit_id JOIN properties p ON u.property_id = p.property_id WHERE p.property_id IN (?)`;
      const costParams = [propertyIds];

      if (startDate && endDate) {
        costQuery += ` AND mc.recorded_date BETWEEN ? AND ?`;
        costParams.push(startDate, endDate);
      } else {
        costQuery += ` AND YEAR(mc.recorded_date) = ?`;
        costParams.push(year);
      }

      const [costs] = await pool.query(costQuery, costParams);
      costs.forEach((cost) => {
        const name = cost.property_name || 'Unknown Property';
        if (!propertyStats[name])
          propertyStats[name] = { income: 0, depositsHeld: 0, expense: 0 };
        propertyStats[name].expense = moneyMath(propertyStats[name].expense)
          .add(cost.amount)
          .value();
      });
    } else {
      // 5. Fallback Strategy: Accrual reporting via Invoice/Maintenance tables
      const invoiceStats = await invoiceModel.getFinancialStats(
        year,
        startDate,
        endDate
      );
      const costStats = await maintenanceCostModel.getFinancialStats(
        year,
        startDate,
        endDate
      );

      invoiceStats
        .filter((s) =>
          propertyIds.includes(Number(s.propertyId || s.property_id))
        )
        .forEach((s) => {
          const name = s.propertyName || s.property_name || 'Unknown Property';
          if (!propertyStats[name])
            propertyStats[name] = { income: 0, expense: 0, depositsHeld: 0 };
          propertyStats[name].income = moneyMath(propertyStats[name].income)
            .add(s.totalIncome || s.total_income)
            .value();
        });

      costStats
        .filter((s) =>
          propertyIds.includes(Number(s.propertyId || s.property_id))
        )
        .forEach((s) => {
          const name = s.propertyName || s.property_name || 'Unknown Property';
          if (!propertyStats[name])
            propertyStats[name] = { income: 0, expense: 0, depositsHeld: 0 };
          propertyStats[name].expense = moneyMath(propertyStats[name].expense)
            .add(s.totalExpense || s.total_expense)
            .value();
        });
    }

    return propertyStats;
  }

  /**
   * Analytics: Financial Review
   * Combines raw stats with business insights/recommendations.
   */
  // FINANCIAL ANALYTICS: Curates raw financial data into a human-readable report with business insights.
  async getFinancialReportData(year, user, startDate = null, endDate = null) {
    // 1. Fetch raw underlying stats
    const stats = await this.getFinancialStats(year, user, startDate, endDate);
    const entries = Object.entries(stats);
    let totalIncome = 0;
    let totalExpense = 0;

    // 2. Calculate primary metrics (ROI, Net Income, Profit Margin)
    const propertyMetrics = entries.map(([name, s]) => {
      const net = s.income - s.expense;
      const margin = s.income > 0 ? ((net / s.income) * 100).toFixed(1) : '0.0';
      totalIncome += s.income;
      totalExpense += s.expense;
      return {
        name,
        income: s.income,
        expense: s.expense,
        net,
        margin: Number(margin),
      };
    });

    const totalNet = totalIncome - totalExpense;
    const totalMargin =
      totalIncome > 0 ? ((totalNet / totalIncome) * 100).toFixed(1) : '0.0';

    // 3. [INSIGHTS] Generate automated warnings based on thresholds
    const insights = [];
    if (entries.length === 0) {
      insights.push({
        message: 'No data found. Verify invoice generation.',
        urgency: 'warning',
      });
    } else {
      const lossProperties = propertyMetrics.filter((p) => p.net < 0);
      if (lossProperties.length > 0) {
        insights.push({
          message: `${lossProperties.length} property running at a loss: ${lossProperties.map((p) => p.name).join(', ')}.`,
          urgency: 'critical',
        });
      } else {
        const best = propertyMetrics.reduce((a, b) =>
          a.margin > b.margin ? a : b
        );
        insights.push({
          message: `Profitable portfolio. Best performer: "${best.name}" at ${best.margin}% margin.`,
          urgency: 'success',
        });
      }

      if (Number(totalMargin) < 15) {
        insights.push({
          message: `Portfolio profit margin (${totalMargin}%) is below 15% threshold.`,
          urgency: 'warning',
        });
      }
    }

    return {
      stats,
      totalIncome,
      totalExpense,
      totalNet,
      totalMargin,
      propertyMetrics,
      insights,
    };
  }

  /**
   * Get a comprehensive ledger summary for a given year.
   * Returns totals for revenue, liabilities, expenses and net operating income.
   */
  // GET LEDGER SUMMARY: Direct bridge to the accounting ledger for formal audits.
  async getLedgerSummary(year, user, startDate = null, endDate = null) {
    const propertyIds = await this._getAccessiblePropertyIds(user);
    return await ledgerModel.getYearlySummary(
      propertyIds,
      year,
      startDate,
      endDate
    );
  }

  // GET OCCUPANCY STATS: Direct breakdown of rented vs vacant units.
  async getOccupancyStats(user, targetDate = null) {
    const propertyIds = await this._getAccessiblePropertyIds(user);
    if (propertyIds.length === 0) return {};
    return await unitModel.getOccupancyStats(propertyIds, targetDate);
  }

  /**
   * Analytics: Occupancy Review
   */
  // OCCUPANCY ANALYTICS: Forecasts portfolio health based on vacancy and reservation rates.
  async getOccupancyReportData(user, year = null, month = null) {
    let targetDate = null;
    if (year && month) {
      const lastDay = new Date(year, month, 0).getDate();
      targetDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else if (year) {
      targetDate = `${year}-12-31`;
    }

    // 1. Fetch raw data
    const propertyStats = await this.getOccupancyStats(user, targetDate);
    const entries = Object.entries(propertyStats);
    let totalUnits = 0,
      totalOccupied = 0,
      totalVacant = 0,
      totalReserved = 0;

    // 2. Map metrics and assign color-coded urgency levels
    const propertyMetrics = entries.map(([name, stats]) => {
      const rate =
        stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0;
      totalUnits += stats.total;
      totalOccupied += stats.occupied;
      totalReserved += stats.reserved || 0;
      totalVacant += stats.vacancies.length;

      return {
        name,
        total: stats.total,
        occupied: stats.occupied,
        reserved: stats.reserved || 0,
        vacancies: stats.vacancies,
        rate,
        rateColor: rate >= 90 ? '#22c55e' : rate >= 70 ? '#f59e0b' : '#ef4444',
        urgencyLabel:
          rate >= 90 ? 'Healthy' : rate >= 70 ? 'Needs Attention' : 'Critical',
      };
    });

    const portfolioRate =
      totalUnits > 0
        ? Math.round(((totalOccupied + totalReserved) / totalUnits) * 100)
        : 0;

    // 3. [INSIGHTS] Generate actionable vacancy alerts
    const insights = [];
    if (entries.length === 0) {
      insights.push({
        message: 'No metrics available. Register units.',
        urgency: 'warning',
      });
    } else if (totalVacant === 0) {
      insights.push({
        message: 'Full occupancy portfolio-wide.',
        urgency: 'success',
      });
    } else {
      const worst = propertyMetrics.reduce((a, b) => (a.rate < b.rate ? a : b));
      insights.push({
        message: `${totalVacant} vacancies. Fill "${worst.name}" as priority.`,
        urgency: 'critical',
      });
    }

    return {
      totalUnits,
      totalOccupied,
      totalVacant,
      totalReserved,
      portfolioRate,
      propertyMetrics,
      insights,
    };
  }

  // GET TENANT RISK STATS: Analyzes payment behavior to predict who might miss rent.
  // TENANT RISK ANALYTICS: Predicts financial defaults by correlating behavior scores with payment history.
  async getTenantRiskStats(user) {
    // 1. Resolve scope
    const propertyIds = await this._getAccessiblePropertyIds(user);
    if (propertyIds.length === 0) return [];

    // 2. Aggregate data from Tenants, Leases, and Invoices
    const placeholders = propertyIds.map(() => '?').join(',');
    const [tenants] = await pool.query(
      `SELECT u.name, t.behavior_score,
              (SELECT COUNT(*) FROM rent_invoices ri JOIN leases l2 ON ri.lease_id = l2.lease_id WHERE l2.tenant_id = t.user_id AND ri.status = 'overdue') as overdue_count
       FROM tenants t JOIN users u ON t.user_id = u.user_id JOIN leases l ON t.user_id = l.tenant_id JOIN units un ON l.unit_id = un.unit_id
       WHERE un.property_id IN (${placeholders}) AND l.status = 'active' GROUP BY t.user_id, u.name, t.behavior_score`,
      propertyIds
    );

    // 3. Classify risk levels based on multi-factor thresholds
    const data = tenants.map((tenant) => {
      let riskLevel = 'Low',
        color = '#22c55e';
      if (tenant.behavior_score < 70 || tenant.overdue_count > 1) {
        riskLevel = 'Medium';
        color = '#f59e0b';
      }
      if (tenant.behavior_score < 50 || tenant.overdue_count > 3) {
        riskLevel = 'High';
        color = '#ef4444';
      }
      return { ...tenant, riskLevel, color };
    });

    // 4. [INSIGHTS] Highlight critical default risks
    const highRisk = data.filter((t) => t.riskLevel === 'High');
    const insights = [];
    if (highRisk.length > 0)
      insights.push({
        message: `${highRisk.length} tenants require immediate eviction review: ${highRisk.map((t) => t.name).join(', ')}.`,
        urgency: 'critical',
      });
    else
      insights.push({
        message: 'Portfolio credit health is optimal.',
        urgency: 'success',
      });

    return { tenants: data, highRisk, insights };
  }

  // MAINTENANCE STATS: Categorizes spending to identify building system failures.
  async getMaintenanceCategoryStats(
    user,
    year = null,
    startDate = null,
    endDate = null
  ) {
    const propertyIds = await this._getAccessiblePropertyIds(user);
    if (propertyIds.length === 0) return { categories: {}, totalCost: 0 };

    // 1. Fetch raw underlying costs for accessible properties
    const placeholders = propertyIds.map(() => '?').join(',');
    let query = `SELECT mc.*, mr.title FROM maintenance_costs mc JOIN maintenance_requests mr ON mc.request_id = mr.request_id JOIN units u ON mr.unit_id = u.unit_id WHERE u.property_id IN (${placeholders})`;
    const params = [...propertyIds];

    if (startDate && endDate) {
      query += ` AND mc.recorded_date BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    } else {
      query += ` AND YEAR(mc.recorded_date) = ?`;
      params.push(year || new Date().getFullYear());
    }

    const [costs] = await pool.query(query, params);

    // 2. Categorization Engine: Regex-based classification of natural language descriptions
    const categories = {};
    let totalCost = 0;

    costs.forEach((cost) => {
      const text = (cost.description + ' ' + (cost.title || '')).toLowerCase();
      let cat = 'General';
      if (/water|leak|plumb|pipe/.test(text)) cat = 'Plumbing';
      else if (/electric|light|power|wire/.test(text)) cat = 'Electrical';
      else if (/ac|air|heat|cool|hvac/.test(text)) cat = 'HVAC';
      else if (/paint|wall/.test(text)) cat = 'Painting';
      else if (/clean|trash/.test(text)) cat = 'Cleaning';
      else if (/door|lock|key/.test(text)) cat = 'Security';

      categories[cat] = moneyMath(categories[cat] || 0)
        .add(cost.amount)
        .value();
      totalCost = moneyMath(totalCost).add(cost.amount).value();
    });

    return { categories, totalCost };
  }

  /**
   * Analytics: Maintenance Review
   */
  // MAINTENANCE ANALYTICS: Identifies outliers in maintenance spending.
  async getMaintenanceReportData(user, year = null) {
    const { categories, totalCost } = await this.getMaintenanceCategoryStats(
      user,
      year
    );
    const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
    const topCategory = sorted[0];
    const topPct =
      topCategory && totalCost > 0
        ? ((topCategory[1] / totalCost) * 100).toFixed(1)
        : '0';

    const insights = [];
    if (totalCost > 0) {
      if (Number(topPct) > 50)
        insights.push({
          message: `"${topCategory[0]}" consumes ${topPct}% of total maintenance budget.`,
          urgency: 'critical',
        });
      else
        insights.push({
          message: 'Maintenance spending is diversified across categories.',
          urgency: 'success',
        });
    }

    return { categories, sorted, totalCost, topCategory, topPct, insights };
  }

  // GET LEASE EXPIRATION STATS: Predicts which leases will end soon so we can start renewals.
  // EXPIRE FORECAST: Identifies leases ending within 90 days to trigger renewal workflows.
  async getLeaseExpirationStats(user) {
    const propertyIds = await this._getAccessiblePropertyIds(user);
    if (propertyIds.length === 0) return [];

    const activeLeases = await leaseModel.findActive();
    const nowTime = getLocalTime();
    const ninetyDaysFromNow = addDays(nowTime, 90);

    return activeLeases.filter((lease) => {
      if (!propertyIds.includes(Number(lease.propertyId))) return false;
      const endDate = parseLocalDate(lease.endDate);
      return endDate >= nowTime && endDate <= ninetyDaysFromNow;
    });
  }

  /**
   * Analytics: Lease Expiration Forecast
   */
  // RENEWAL ANALYTICS: Quantifies revenue at risk due to upcoming move-outs.
  async getLeaseExpirationReportData(user) {
    // 1. Identify upcoming move-outs
    const expiringLeases = await this.getLeaseExpirationStats(user);
    const nowTime = getLocalTime();

    // 2. Classify by urgency (Critical < 14 days, Urgent < 30 days)
    const leasesWithDays = expiringLeases
      .map((lease) => {
        const diffDays = Math.ceil(
          (parseLocalDate(lease.endDate).getTime() - nowTime.getTime()) /
            (1000 * 60 * 60 * 24)
        );
        let urgency = 'upcoming',
          urgencyColor = '#334155';
        if (diffDays <= 14) {
          urgency = 'critical';
          urgencyColor = '#ef4444';
        } else if (diffDays <= 30) {
          urgency = 'urgent';
          urgencyColor = '#f59e0b';
        }
        return { ...lease, diffDays, urgency, urgencyColor };
      })
      .sort((a, b) => a.diffDays - b.diffDays);

    const critical = leasesWithDays.filter((l) => l.urgency === 'critical');
    const revenueAtRisk = leasesWithDays.reduce(
      (sum, l) => sum + (l.monthlyRent || 0),
      0
    );

    // 3. [INSIGHTS] Flash alerts for revenue protection
    const insights = [];
    if (critical.length > 0)
      insights.push({
        message: `${critical.length} leases expire within 14 days. LKR ${fromCents(critical.reduce((s, l) => s + l.monthlyRent, 0)).toLocaleString()}/mo at risk.`,
        urgency: 'critical',
      });
    else
      insights.push({
        message: 'No critical expirations this fortnight.',
        urgency: 'success',
      });

    return { leasesWithDays, revenueAtRisk, insights };
  }

  // CONVERSION ANALYTICS: Measures marketing ROI by tracking lead-to-tenant journey.
  async getLeadConversionStats(user, startDate = null, endDate = null) {
    const ownerId = user?.role === ROLES.OWNER ? user.id : null;
    const stats = await leadModel.getLeadConversionStats(
      ownerId,
      startDate,
      endDate
    );
    return {
      Total: Number(stats.Total || 0),
      Interested: Number(stats.Interested || 0),
      Converted: Number(stats.Converted || 0),
      Dropped: Number(stats.Dropped || 0),
    };
  }

  /**
   * Analytics: Lead Conversion
   */
  // FUNNEL ANALYTICS: Identifies leaks in the sales pipeline.
  async getLeadConversionReportData(user, startDate = null, endDate = null) {
    const stats = await this.getLeadConversionStats(user, startDate, endDate);
    const convRate =
      stats.Total > 0
        ? ((stats.Converted / stats.Total) * 100).toFixed(1)
        : '0.0';
    const dropRate =
      stats.Total > 0
        ? ((stats.Dropped / stats.Total) * 100).toFixed(1)
        : '0.0';

    const insights = [];
    if (stats.Total > 0) {
      if (Number(convRate) >= 15)
        insights.push({
          message: `Conversion rate at ${convRate}%. Pipeline is healthy.`,
          urgency: 'success',
        });
      else
        insights.push({
          message:
            'Low conversion rate detected. Review property photos/pricing.',
          urgency: 'critical',
        });
    }

    return { stats, convRate, dropRate, insights };
  }

  // CASH FLOW FORECAST: Month-on-month trend analysis for institutional review.
  async getMonthlyCashFlow(user) {
    const propertyIds = await this._getAccessiblePropertyIds(user);
    if (propertyIds.length === 0) return [];
    return await ledgerModel.getMonthlyStats(propertyIds, 12);
  }
}

export default new ReportService();
