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
  // Helper: Get property IDs accessible by a user based on role
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

  // GET FINANCIAL STATS: Aggregates revenue and expenses to see if properties are profitable.
  async getFinancialStats(year, user, startDate = null, endDate = null) {
    const propertyIds = await this._getAccessiblePropertyIds(user);
    if (propertyIds.length === 0) return {};

    // Try ledger-based reporting first
    const ledgerSummary = await ledgerModel.getSummaryByProperty(
      propertyIds,
      year,
      startDate,
      endDate
    );
    const hasLedgerData = Object.keys(ledgerSummary).length > 0;

    const propertyStats = {};

    if (hasLedgerData) {
      // Ledger-based: accurate revenue vs liability vs expense
      for (const [name, data] of Object.entries(ledgerSummary)) {
        propertyStats[name] = {
          income: data.revenue, // Only real revenue (rent + late fees)
          depositsHeld: data.liabilityHeld - data.liabilityRefunded,
          expense: data.expense,
        };
      }

      // Also include maintenance costs not yet in ledger
      let costQuery = `SELECT mc.*, p.name as property_name
                       FROM maintenance_costs mc
                       JOIN maintenance_requests mr ON mc.request_id = mr.request_id
                       JOIN units u ON mr.unit_id = u.unit_id
                       JOIN properties p ON u.property_id = p.property_id
                       WHERE p.property_id IN (?)`;
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
      // Fallback: Optimized invoice-based approach
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

      // Filter by accessible properties
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
  async getFinancialReportData(year, user, startDate = null, endDate = null) {
    const stats = await this.getFinancialStats(year, user, startDate, endDate);
    const entries = Object.entries(stats);
    let totalIncome = 0;
    let totalExpense = 0;

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

    // Generate Insights
    const insights = [];
    if (entries.length === 0) {
      insights.push({
        message:
          'No financial data available for this year. Ensure invoices are being generated and payments recorded.',
        urgency: 'warning',
      });
    } else {
      const lossProperties = propertyMetrics.filter((p) => p.net < 0);
      const best = propertyMetrics.reduce((a, b) =>
        a.margin > b.margin ? a : b
      );
      const worst = propertyMetrics.reduce((a, b) =>
        a.margin < b.margin ? a : b
      );

      if (lossProperties.length > 0) {
        insights.push({
          message: `${lossProperties.length} propert${lossProperties.length > 1 ? 'ies are' : 'y is'} running at a loss: ${lossProperties.map((p) => p.name).join(', ')}. Review expense allocation and consider rent adjustments.`,
          urgency: 'critical',
        });
      } else {
        insights.push({
          message: `All properties are profitable. Best performer: "${best.name}" at ${best.margin}% margin.`,
          urgency: 'success',
        });
      }

      if (propertyMetrics.length > 1 && best.name !== worst.name) {
        insights.push({
          message: `Lowest margin property: "${worst.name}" at ${worst.margin}%. Consider investigating operational costs or increasing occupancy.`,
          urgency: worst.margin < 10 ? 'warning' : 'info',
        });
      }

      if (Number(totalMargin) < 15) {
        insights.push({
          message: `Overall profit margin (${totalMargin}%) is below the healthy 15% threshold.`,
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
  async getLedgerSummary(year, user, startDate = null, endDate = null) {
    const propertyIds = await this._getAccessiblePropertyIds(user);
    return await ledgerModel.getYearlySummary(
      propertyIds,
      year,
      startDate,
      endDate
    );
  }

  // GET OCCUPANCY STATS: Calculates how many units are rented vs vacant.
  async getOccupancyStats(user) {
    const propertyIds = await this._getAccessiblePropertyIds(user);
    if (propertyIds.length === 0) return {};

    // Fetch pre-aggregated occupancy data from DB, scoped to accessible properties
    const propertyStats = await unitModel.getOccupancyStats(propertyIds);
    return propertyStats;
  }

  /**
   * Analytics: Occupancy Review
   */
  async getOccupancyReportData(user) {
    const propertyStats = await this.getOccupancyStats(user);
    const entries = Object.entries(propertyStats);
    let totalUnits = 0;
    let totalOccupied = 0;
    let totalVacant = 0;
    let totalReserved = 0;

    const propertyMetrics = entries.map(([name, stats]) => {
      const rate =
        stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0;
      totalUnits += stats.total;
      totalOccupied += stats.occupied;
      totalReserved += stats.reserved || 0;
      totalVacant += stats.vacancies.length;

      const rateColor =
        rate >= 90 ? '#22c55e' : rate >= 70 ? '#f59e0b' : '#ef4444';
      const urgencyLabel =
        rate >= 90 ? 'Healthy' : rate >= 70 ? 'Needs Attention' : 'Critical';

      return {
        name,
        total: stats.total,
        occupied: stats.occupied,
        reserved: stats.reserved || 0,
        vacancies: stats.vacancies,
        rate,
        rateColor,
        urgencyLabel,
      };
    });

    const portfolioRate =
      totalUnits > 0
        ? Math.round(((totalOccupied + totalReserved) / totalUnits) * 100)
        : 0;

    // Insights for Occupancy
    const insights = [];
    if (entries.length === 0) {
      insights.push({
        message:
          'No property data available. Ensure properties and units are registered.',
        urgency: 'warning',
      });
    } else if (totalVacant === 0) {
      insights.push({
        message:
          'Excellent — all units across your portfolio are fully occupied.',
        urgency: 'success',
      });
    } else {
      const worst = propertyMetrics.reduce((a, b) => (a.rate < b.rate ? a : b));
      insights.push({
        message: `${totalVacant} vacant unit(s) across your portfolio. Prioritize filling vacancies at "${worst.name}" (${worst.rate}% occupancy).`,
        urgency: 'critical',
      });

      const lowProperties = propertyMetrics.filter((p) => p.rate < 70);
      if (lowProperties.length > 0) {
        insights.push({
          message: `${lowProperties.length} propert${lowProperties.length > 1 ? 'ies have' : 'y has'} occupancy below 70%.`,
          urgency: 'warning',
        });
      }
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
  async getTenantRiskStats(user) {
    const propertyIds = await this._getAccessiblePropertyIds(user);
    if (propertyIds.length === 0) return [];

    // Fetch tenant risk profiles scoped to the user's properties
    const placeholders = propertyIds.map(() => '?').join(',');
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
             WHERE un.property_id IN (${placeholders})
             AND l.status = 'active'
             GROUP BY t.user_id, u.name, t.behavior_score`,
      [...propertyIds]
    );

    const data = tenants.map((tenant) => {
      let riskLevel = 'Low';
      let color = '#22c55e'; // standardized hex for PDF

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

    // Insights for Risk
    const highRisk = data.filter((t) => t.riskLevel === 'High');
    const medRisk = data.filter((t) => t.riskLevel === 'Medium');
    const avgScore =
      data.length > 0
        ? Math.round(
            data.reduce((s, t) => s + t.behavior_score, 0) / data.length
          )
        : 0;

    const insights = [];
    if (data.length === 0) {
      insights.push({
        message: 'No active tenants found. Ensure leases are active.',
        urgency: 'warning',
      });
    } else if (highRisk.length > 0) {
      insights.push({
        message: `${highRisk.length} tenant(s) require immediate attention: ${highRisk.map((t) => t.name).join(', ')}.`,
        urgency: 'critical',
      });
    } else if (medRisk.length > 0) {
      insights.push({
        message: `${medRisk.length} tenant(s) are at medium risk. Monitor payment patterns.`,
        urgency: 'warning',
      });
    } else {
      insights.push({
        message: `Portfolio risk is minimal. Average behavior score: ${avgScore}/100.`,
        urgency: 'success',
      });
    }

    return { tenants: data, highRisk, medRisk, avgScore, insights };
  }

  async getMaintenanceCategoryStats(
    user,
    year = null,
    startDate = null,
    endDate = null
  ) {
    const propertyIds = await this._getAccessiblePropertyIds(user);
    if (propertyIds.length === 0) return { categories: {}, totalCost: 0 };

    const placeholders = propertyIds.map(() => '?').join(',');
    let query = `SELECT mc.*, mr.title, p.name as property_name
                 FROM maintenance_costs mc
                 JOIN maintenance_requests mr ON mc.request_id = mr.request_id
                 JOIN units u ON mr.unit_id = u.unit_id
                 JOIN properties p ON u.property_id = p.property_id
                 WHERE p.property_id IN (${placeholders})`;

    const params = [...propertyIds];

    if (startDate && endDate) {
      query += ` AND mc.recorded_date BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    } else {
      const targetYear = year || new Date().getFullYear();
      query += ` AND YEAR(mc.recorded_date) = ?`;
      params.push(targetYear);
    }

    query += ` ORDER BY mc.recorded_date DESC`;

    const [costs] = await pool.query(query, params);

    const categories = {};
    let totalCost = 0;

    costs.forEach((cost) => {
      const text = (cost.description + ' ' + (cost.title || '')).toLowerCase();
      let category = 'General';

      if (
        text.includes('water') ||
        text.includes('leak') ||
        text.includes('plumb') ||
        text.includes('pipe')
      )
        category = 'Plumbing';
      else if (
        text.includes('electric') ||
        text.includes('light') ||
        text.includes('power') ||
        text.includes('wire')
      )
        category = 'Electrical';
      else if (
        text.includes('ac') ||
        text.includes('air') ||
        text.includes('heat') ||
        text.includes('cool') ||
        text.includes('hvac')
      )
        category = 'HVAC';
      else if (text.includes('paint') || text.includes('wall'))
        category = 'Painting';
      else if (text.includes('clean') || text.includes('trash'))
        category = 'Cleaning';
      else if (
        text.includes('door') ||
        text.includes('lock') ||
        text.includes('key')
      )
        category = 'Security';

      if (!categories[category]) categories[category] = 0;
      categories[category] = moneyMath(categories[category])
        .add(cost.amount)
        .value();
      totalCost = moneyMath(totalCost).add(cost.amount).value();
    });

    return { categories, totalCost };
  }

  /**
   * Analytics: Maintenance Review
   */
  async getMaintenanceReportData(user, year = null) {
    const { categories, totalCost } = await this.getMaintenanceCategoryStats(
      user,
      year
    );
    const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
    const topCategory = sorted.length > 0 ? sorted[0] : null;
    const topPct =
      topCategory && totalCost > 0
        ? ((topCategory[1] / totalCost) * 100).toFixed(1)
        : '0';

    const insights = [];
    if (totalCost === 0) {
      insights.push({
        message: 'No maintenance costs recorded yet.',
        urgency: 'info',
      });
    } else {
      if (Number(topPct) > 50) {
        insights.push({
          message: `"${topCategory[0]}" accounts for ${topPct}% of total spend. Consider preventive measures.`,
          urgency: 'critical',
        });
      } else if (Number(topPct) > 30) {
        insights.push({
          message: `"${topCategory[0]}" is your largest expense. Monitor quarterly.`,
          urgency: 'warning',
        });
      } else {
        insights.push({
          message: `Maintenance costs are well-distributed. No single category dominates spending.`,
          urgency: 'success',
        });
      }

      if (Object.keys(categories).length === 1) {
        insights.push({
          message:
            'Only one category detected. Use more detailed descriptions for better auto-categorization.',
          urgency: 'info',
        });
      }
    }

    return { categories, sorted, totalCost, topCategory, topPct, insights };
  }

  // GET LEASE EXPIRATION STATS: Predicts which leases will end soon so we can start renewals.
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

  /**
   * Analytics: Lease Expiration Forecast
   */
  async getLeaseExpirationReportData(user) {
    const expiringLeases = await this.getLeaseExpirationStats(user);
    const nowTime = getLocalTime();

    const leasesWithDays = expiringLeases
      .map((lease) => {
        const endDate = parseLocalDate(lease.endDate);
        const diffTime = endDate.getTime() - nowTime.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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
    const urgent = leasesWithDays.filter((l) => l.urgency === 'urgent');
    const upcoming = leasesWithDays.filter((l) => l.urgency === 'upcoming');
    const revenueAtRisk = leasesWithDays.reduce(
      (sum, l) => sum + (l.monthlyRent || 0),
      0
    );

    const insights = [];
    if (leasesWithDays.length === 0) {
      insights.push({
        message:
          'No leases expiring in next 90 days. Portfolio stability is excellent.',
        urgency: 'success',
      });
    } else {
      if (critical.length > 0) {
        const critRent = critical.reduce((s, l) => s + (l.monthlyRent || 0), 0);
        insights.push({
          message: `${critical.length} lease(s) expire within 14 days (LKR ${fromCents(critRent).toLocaleString()}/mo risk). contact tenants immediately.`,
          urgency: 'critical',
        });
      }
      if (urgent.length > 0) {
        insights.push({
          message: `${urgent.length} lease(s) expire within 15–30 days. Send formal renewal notices.`,
          urgency: 'warning',
        });
      }
      if (upcoming.length > 0 && critical.length === 0 && urgent.length === 0) {
        insights.push({
          message: `${upcoming.length} lease(s) expiring in 31–90 days. Begin proactive conversations.`,
          urgency: 'info',
        });
      }
    }

    return {
      leasesWithDays,
      critical,
      urgent,
      upcoming,
      revenueAtRisk,
      insights,
    };
  }

  // GET LEAD CONVERSION STATS: Tracks how successful we are at turning website visitors into tenants.
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
    if (stats.Total === 0) {
      insights.push({
        message:
          'No leads captured yet. Track inquiries to measure marketing performance.',
        urgency: 'warning',
      });
    } else {
      if (Number(convRate) >= 30)
        insights.push({
          message: `Strong conversion rate at ${convRate}%. Pipeline is performing well.`,
          urgency: 'success',
        });
      else if (Number(convRate) >= 15)
        insights.push({
          message: `Conversion rate (${convRate}%) is moderate. Review follow-up timing.`,
          urgency: 'warning',
        });
      else
        insights.push({
          message: `Low conversion rate (${convRate}%). Improve property listings or response times.`,
          urgency: 'critical',
        });

      if (Number(dropRate) > 40)
        insights.push({
          message: `High drop-off rate (${dropRate}%). investigate leak in the pipeline.`,
          urgency: 'critical',
        });
      if (stats.Interested > 0)
        insights.push({
          message: `${stats.Interested} lead(s) in active pipeline.`,
          urgency: 'info',
        });
    }

    return { stats, convRate, dropRate, insights };
  }

  async getMonthlyCashFlow(user) {
    const propertyIds = await this._getAccessiblePropertyIds(user);
    if (propertyIds.length === 0) return [];

    const stats = await ledgerModel.getMonthlyStats(propertyIds, 12);
    return stats;
  }
}

export default new ReportService();
