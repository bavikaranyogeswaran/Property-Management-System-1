// ============================================================================
//  REPORT CONTROLLER (The Data Scientist)
// ============================================================================
//  This file generates PDF reports and JSON statistics for the dashboard.
//  It helps Owners and Treasurers see how the business is performing.
// ============================================================================

import reportService from '../services/reportService.js';
import { getLocalTime, parseLocalDate } from '../utils/dateUtils.js';
import ReportGenerator from '../utils/pdfGenerator.js';
import { fromCents } from '../utils/moneyUtils.js';
import catchAsync from '../utils/catchAsync.js';

// ============================================================================
//  [S1 FIX] PERIOD RESOLUTION UTILITY (Single Source of Truth)
//  Converts raw query params into ISO date boundaries and a human-readable label.
//  Handles month-specific, year-only, and all-time filtering consistently.
// ============================================================================
function resolvePeriod(query, defaultTitle = null) {
  const year = parseInt(query.year) || new Date().getFullYear();
  const month = query.month ? parseInt(query.month) : null;
  let startDate = null;
  let endDate = null;
  let periodTitle = defaultTitle !== null ? defaultTitle : `${year}`;

  if (month && month >= 1 && month <= 12) {
    // Month-specific filter
    const lastDay = new Date(year, month, 0).getDate();
    startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const monthLabel = new Date(year, month - 1).toLocaleString('default', {
      month: 'long',
    });
    periodTitle = `${monthLabel} ${year}`;
  } else if (query.year) {
    // Year-only filter
    startDate = `${year}-01-01`;
    endDate = `${year}-12-31`;
    periodTitle = `${year}`;
  }

  return { year, month, startDate, endDate, periodTitle };
}

class ReportController {
  // =========================================================================
  //  1. FINANCIAL PERFORMANCE REPORT
  // =========================================================================
  // FINANCIAL REPORT: Generates a PDF showing income vs expenses for a specific year.
  generateFinancialReport = catchAsync(async (req, res, next) => {
    // 1. [TRANSFORMATION] Period resolution via shared utility (S1 fix)
    const { year, month, startDate, endDate, periodTitle } = resolvePeriod(
      req.query
    );

    // 2. [DELEGATION] Computation: Aggregate incomes, expenses, and margins across property portfolios
    const data = await reportService.getFinancialReportData(
      year,
      req.user,
      startDate,
      endDate
    );

    // 3. [ORCHESTRATION] PDF Generation: Initialize drawing engine with responsive layout headers
    const gen = new ReportGenerator(
      res,
      `financial_report_${year}_${month || 'full'}.pdf`,
      `Financial Performance Report — ${periodTitle}`,
      'Income, expense breakdown, and profitability analysis by property'
    );

    gen.generateHeader();

    // 4. [VISUAL] KPI Panel: Draw the top-level financial highlights
    gen.drawKpiPanel([
      {
        label: 'TOTAL REVENUE',
        value: `LKR ${fromCents(data.totalIncome).toLocaleString()}`,
        color: '#22c55e',
      },
      {
        label: 'TOTAL EXPENSES',
        value: `LKR ${fromCents(data.totalExpense).toLocaleString()}`,
        color: '#ef4444',
      },
      {
        label: 'NET INCOME',
        value: `LKR ${fromCents(data.totalNet).toLocaleString()}`,
        color: data.totalNet >= 0 ? '#2563eb' : '#ef4444',
      },
      {
        label: 'PROFIT MARGIN',
        value: `${data.totalMargin}%`,
        color: Number(data.totalMargin) >= 20 ? '#22c55e' : '#f59e0b',
      },
    ]);

    // 5. [VISUAL] Tabular breakdown: Iterate through property metrics and draw ledger rows
    gen.drawSectionTitle('Property Breakdown');

    const columns = [
      { x: 50, width: 145, align: 'left' },
      { x: 200, width: 85, align: 'right' },
      { x: 285, width: 85, align: 'right' },
      { x: 370, width: 110, align: 'right' },
      { x: 485, width: 65, align: 'right' },
    ];

    gen.drawTableRow(
      [
        { ...columns[0], text: 'Property' },
        { ...columns[1], text: 'Income' },
        { ...columns[2], text: 'Expenses' },
        { ...columns[3], text: 'Net Income' },
        { ...columns[4], text: 'Margin' },
      ],
      { bold: true }
    );

    gen.doc
      .moveTo(50, gen.y - 2)
      .lineTo(550, gen.y - 2)
      .strokeColor('#e2e8f0')
      .stroke();
    gen.y += 4;

    for (const p of data.propertyMetrics) {
      gen.checkPageBreak(20);
      const isLoss = p.net < 0;
      gen.drawTableRow([
        { ...columns[0], text: p.name },
        { ...columns[1], text: `LKR ${fromCents(p.income).toLocaleString()}` },
        { ...columns[2], text: `LKR ${fromCents(p.expense).toLocaleString()}` },
        {
          ...columns[3],
          text: `LKR ${fromCents(p.net).toLocaleString()}`,
          color: isLoss ? '#ef4444' : '#22c55e',
        },
        {
          ...columns[4],
          text: `${p.margin}%`,
          color:
            p.margin < 10 ? '#ef4444' : p.margin < 30 ? '#f59e0b' : '#22c55e',
        },
      ]);
    }

    gen.doc
      .moveTo(50, gen.y)
      .lineTo(550, gen.y)
      .strokeColor('#e2e8f0')
      .stroke();
    gen.y += 8;
    gen.doc.font('Helvetica-Bold').fontSize(9);
    gen.doc.text('TOTAL', 50, gen.y);
    gen.doc.text(
      `LKR ${fromCents(data.totalIncome).toLocaleString()}`,
      200,
      gen.y,
      { width: 85, align: 'right' }
    );
    gen.doc.text(
      `LKR ${fromCents(data.totalExpense).toLocaleString()}`,
      285,
      gen.y,
      { width: 85, align: 'right' }
    );
    gen.doc
      .fillColor(data.totalNet >= 0 ? '#22c55e' : '#ef4444')
      .text(`LKR ${fromCents(data.totalNet).toLocaleString()}`, 370, gen.y, {
        width: 110,
        align: 'right',
      });
    gen.doc
      .fillColor('#1e293b')
      .text(`${data.totalMargin}%`, 485, gen.y, { width: 65, align: 'right' });
    gen.doc.fillColor('black');
    gen.y += 30;

    // 6. [VISUAL] Insights: Draw AI-generated or rule-based trends analysis
    gen.drawInsights(data.insights);

    // 7. [FINALIZE] Buffer completion and stream to client
    gen.finalize();
  });

  // =========================================================================
  //  2. OCCUPANCY REPORT
  // =========================================================================
  // OCCUPANCY REPORT: Generates a PDF showing which units are empty and which are generating money.
  generateOccupancyReport = catchAsync(async (req, res, next) => {
    // 1. [TRANSFORMATION] Period resolution via shared utility (S1 fix)
    // Default title is 'Current Snapshot' when no period params are supplied
    const { year, month, startDate, endDate, periodTitle } = resolvePeriod(
      req.query,
      req.query.year || req.query.month ? null : 'Current Snapshot'
    );

    // 1. [DELEGATION] State Inspection: Resolve status of all units across all properties
    const data = await reportService.getOccupancyReportData(
      req.user,
      year,
      month
    );

    // 2. [ORCHESTRATION] PDF Generation
    const gen = new ReportGenerator(
      res,
      'occupancy_report.pdf',
      `Occupancy Report — ${periodTitle}`,
      'Unit occupancy rates, vacancy analysis, and revenue impact assessment'
    );

    gen.generateHeader();

    // 3. [VISUAL] KPI Panel
    gen.drawKpiPanel([
      {
        label: 'PORTFOLIO OCCUPANCY',
        value: `${data.portfolioRate}%`,
        color:
          data.portfolioRate >= 90
            ? '#22c55e'
            : data.portfolioRate >= 70
              ? '#f59e0b'
              : '#ef4444',
      },
      { label: 'TOTAL UNITS', value: `${data.totalUnits}`, color: '#2563eb' },
      { label: 'OCCUPIED', value: `${data.totalOccupied}`, color: '#22c55e' },
      {
        label: 'VACANT',
        value: `${data.totalVacant}`,
        color: data.totalVacant === 0 ? '#22c55e' : '#ef4444',
      },
    ]);

    // 4. [VISUAL] Sectioning: Detail every property's specific performance
    gen.drawSectionTitle('Property-Level Analysis');

    for (const p of data.propertyMetrics) {
      gen.checkPageBreak(80);
      gen.doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#1e293b')
        .text(p.name, 50, gen.y);
      gen.doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(p.rateColor)
        .text(`${p.rate}% — ${p.urgencyLabel}`, 400, gen.y, {
          width: 150,
          align: 'right',
        });
      gen.y += 18;
      gen.doc.font('Helvetica').fontSize(9).fillColor('#64748b');
      gen.doc.text(`${p.occupied} of ${p.total} units occupied`, 50, gen.y);
      gen.y += 14;

      if (p.vacancies.length > 0) {
        gen.doc
          .fillColor('#ef4444')
          .text(`Vacant units: ${p.vacancies.join(', ')}`, 50, gen.y);
        gen.y += 14;
      }
      gen.doc.fillColor('black');
      gen.doc
        .moveTo(50, gen.y + 2)
        .lineTo(550, gen.y + 2)
        .strokeColor('#f1f5f9')
        .stroke();
      gen.y += 12;
    }

    // 5. [VISUAL] Predictions/Advice
    gen.drawInsights(data.insights);

    gen.finalize();
  });

  // =========================================================================
  //  3. TENANT RISK PROFILE REPORT
  // =========================================================================
  // TENANT RISK REPORT: Generates a PDF flagging tenants with poor payment histories.
  generateTenantRiskReport = catchAsync(async (req, res, next) => {
    // 1. [DELEGATION] Behavioral Analysis: Compute scores based on late payments and maintenance disputes
    const data = await reportService.getTenantRiskStats(req.user);

    // 2. [ORCHESTRATION] PDF Generation
    const gen = new ReportGenerator(
      res,
      'tenant_risk_report.pdf',
      'Tenant Risk Profile',
      'Behavior score analysis, payment reliability assessment, and risk-based action plan'
    );

    gen.generateHeader();

    // 3. [VISUAL] KPI Panel
    gen.drawKpiPanel([
      {
        label: 'TOTAL TENANTS',
        value: `${data.tenants.length}`,
        color: '#2563eb',
      },
      {
        label: 'HIGH RISK',
        value: `${data.highRisk.length}`,
        color: data.highRisk.length > 0 ? '#ef4444' : '#22c55e',
      },
      {
        label: 'MEDIUM RISK',
        value: `${data.medRisk.length}`,
        color: data.medRisk.length > 0 ? '#f59e0b' : '#22c55e',
      },
      {
        label: 'AVG SCORE',
        value: `${data.avgScore}/100`,
        color:
          data.avgScore >= 70
            ? '#22c55e'
            : data.avgScore >= 50
              ? '#f59e0b'
              : '#ef4444',
      },
    ]);

    // 4. [VISUAL] Risk Matrix Table: Itemize individual tenant reliability scores
    gen.drawSectionTitle('Tenant Risk Assessment');

    const columns = [
      { x: 50, width: 165, align: 'left' },
      { x: 220, width: 50, align: 'center' },
      { x: 280, width: 50, align: 'center' },
      { x: 340, width: 50, align: 'center' },
      { x: 410, width: 70, align: 'center' },
      { x: 485, width: 70, align: 'center' },
    ];

    gen.drawTableRow(
      [
        { ...columns[0], text: 'Tenant Name' },
        { ...columns[1], text: 'Score' },
        { ...columns[2], text: 'Overdue' },
        { ...columns[3], text: 'Paid' },
        { ...columns[4], text: 'Risk Level' },
        { ...columns[5], text: 'Action' },
      ],
      { bold: true }
    );

    gen.doc
      .moveTo(50, gen.y - 2)
      .lineTo(550, gen.y - 2)
      .strokeColor('#e2e8f0')
      .stroke();
    gen.y += 4;

    for (const tenant of data.tenants) {
      gen.checkPageBreak(20);
      const action =
        tenant.riskLevel === 'High'
          ? 'Escalate'
          : tenant.riskLevel === 'Medium'
            ? 'Monitor'
            : 'No action';
      const actionColor =
        tenant.riskLevel === 'High'
          ? '#ef4444'
          : tenant.riskLevel === 'Medium'
            ? '#f59e0b'
            : '#22c55e';

      gen.drawTableRow([
        { ...columns[0], text: tenant.name },
        {
          ...columns[1],
          text: tenant.behavior_score.toString(),
          color:
            tenant.behavior_score < 50
              ? '#ef4444'
              : tenant.behavior_score < 70
                ? '#f59e0b'
                : '#334155',
        },
        {
          ...columns[2],
          text: tenant.overdue_count.toString(),
          color: tenant.overdue_count > 0 ? '#ef4444' : '#334155',
        },
        { ...columns[3], text: tenant.paid_count.toString() },
        {
          ...columns[4],
          text: tenant.riskLevel,
          color: tenant.color,
          bold: true,
        },
        { ...columns[5], text: action, color: actionColor, bold: true },
      ]);
    }

    // 5. [VISUAL] Remediation Strategy
    gen.drawInsights(data.insights);

    gen.finalize();
  });

  // =========================================================================
  //  4. MAINTENANCE COST ANALYSIS REPORT
  // =========================================================================
  // MAINTENANCE REPORT: Categorizes repair spend to find cost leaks.
  generateMaintenanceCategoryReport = catchAsync(async (req, res, next) => {
    // 1. [TRANSFORMATION] Period resolution via shared utility (S1 fix)
    const { year, month, startDate, endDate, periodTitle } = resolvePeriod(
      req.query
    );

    // 2. [DELEGATION] Cost Aggregation
    const data = await reportService.getMaintenanceReportData(
      req.user,
      year,
      startDate,
      endDate
    );

    // 3. [ORCHESTRATION] PDF Generation
    const gen = new ReportGenerator(
      res,
      `maintenance_report_${year}_${month || 'full'}.pdf`,
      `Maintenance Cost Analysis — ${periodTitle}`,
      'Expense categorization, cost concentration analysis, and budget optimization insights'
    );

    gen.generateHeader();

    // 4. [VISUAL] KPI Panel
    gen.drawKpiPanel([
      {
        label: 'TOTAL SPEND',
        value:
          data.totalCost > 0
            ? `LKR ${fromCents(data.totalCost).toLocaleString()}`
            : 'LKR 0',
        color: data.totalCost > 0 ? '#ef4444' : '#22c55e',
      },
      { label: 'CATEGORIES', value: `${data.sorted.length}`, color: '#2563eb' },
      {
        label: 'TOP CATEGORY',
        value: data.topCategory ? data.topCategory[0] : 'N/A',
        color: '#f59e0b',
      },
      {
        label: 'TOP CATEGORY %',
        value: `${data.topPct}%`,
        color: Number(data.topPct) > 50 ? '#ef4444' : '#22c55e',
      },
    ]);

    if (data.totalCost === 0) {
      gen.drawSectionTitle('Analysis');
    } else {
      // 5. [VISUAL] Category Chart: Draw horizontal bars representing share of spend
      gen.drawSectionTitle('Cost Breakdown by Category');

      const columns = [
        { x: 50, width: 145, align: 'left' },
        { x: 200, width: 90, align: 'right' },
        { x: 300, width: 50, align: 'right' },
        { x: 370, width: 180, align: 'left' },
      ];

      const barColors = [
        '#2563eb',
        '#7c3aed',
        '#06b6d4',
        '#f59e0b',
        '#ef4444',
        '#22c55e',
        '#64748b',
      ];

      gen.drawTableRow(
        [
          { ...columns[0], text: 'Category' },
          { ...columns[1], text: 'Amount (LKR)' },
          { ...columns[2], text: 'Share' },
          { ...columns[3], text: 'Distribution' },
        ],
        { bold: true }
      );

      gen.doc
        .moveTo(50, gen.y - 2)
        .lineTo(550, gen.y - 2)
        .strokeColor('#e2e8f0')
        .stroke();
      gen.y += 4;

      data.sorted.forEach(([cat, amount], index) => {
        gen.checkPageBreak(22);
        const percent = ((amount / data.totalCost) * 100).toFixed(1);
        const barWidth = Math.max(2, (amount / data.totalCost) * 180);
        const barColor = barColors[index % barColors.length];

        gen.drawTableRow([
          { ...columns[0], text: cat },
          { ...columns[1], text: fromCents(amount).toLocaleString() },
          { ...columns[2], text: `${percent}%` },
          { ...columns[3], text: '' }, // Placeholder for bar
        ]);

        // Overlay the distribution bar on the last column
        gen.doc.save();
        gen.doc
          .roundedRect(columns[3].x, gen.y - 15, barWidth, 10, 3)
          .fill(barColor);
        gen.doc.restore();
      });
      gen.y += 10;
    }

    // 6. [VISUAL] Optimization Advice
    gen.drawInsights(data.insights);

    gen.finalize();
  });

  // =========================================================================
  //  5. LEASE EXPIRATION FORECAST REPORT
  // =========================================================================
  // LEASE EXPIRATION REPORT: Forecasts which rental agreements are ending soon.
  generateLeaseExpirationReport = catchAsync(async (req, res, next) => {
    // 1. [DELEGATION] Pipeline Analysis: Interrogate all active leases for end dates within 90 days
    const data = await reportService.getLeaseExpirationReportData(req.user);

    // 2. [ORCHESTRATION] PDF Generation
    const gen = new ReportGenerator(
      res,
      'lease_expiration_report.pdf',
      'Lease Expiration Forecast',
      '90-day expiration pipeline, renewal urgency analysis, and revenue-at-risk assessment'
    );

    gen.generateHeader();

    // 3. [VISUAL] KPI Panel
    gen.drawKpiPanel([
      {
        label: 'TOTAL EXPIRING',
        value: `${data.leasesWithDays.length}`,
        color: '#2563eb',
      },
      {
        label: 'CRITICAL (<14d)',
        value: `${data.critical.length}`,
        color: data.critical.length > 0 ? '#ef4444' : '#22c55e',
      },
      {
        label: 'URGENT (<30d)',
        value: `${data.urgent.length}`,
        color: data.urgent.length > 0 ? '#f59e0b' : '#22c55e',
      },
      {
        label: 'REVENUE AT RISK',
        value: `LKR ${fromCents(data.revenueAtRisk).toLocaleString()}`,
        color: '#ef4444',
      },
    ]);

    // 4. [VISUAL] Pipeline Analysis: Detail units by urgency (Days Left)
    gen.drawSectionTitle('Expiration Pipeline (Next 90 Days)');

    gen.doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b');
    gen.doc.text('Property / Unit', 50, gen.y);
    gen.doc.text('Tenant', 200, gen.y);
    gen.doc.text('End Date', 320, gen.y);
    gen.doc.text('Rent', 410, gen.y, { width: 70, align: 'right' });
    gen.doc.text('Days Left', 490, gen.y, { width: 60, align: 'right' });
    gen.doc
      .moveTo(50, gen.y + 14)
      .lineTo(550, gen.y + 14)
      .strokeColor('#e2e8f0')
      .stroke();
    gen.y += 22;

    gen.doc.font('Helvetica').fontSize(9);
    for (const lease of data.leasesWithDays) {
      gen.checkPageBreak(25);
      gen.doc
        .fillColor('#334155')
        .font('Helvetica-Bold')
        .text(`${lease.propertyName} - Unit ${lease.unitName}`, 50, gen.y);
      gen.doc.font('Helvetica').text(lease.tenantName, 200, gen.y);
      gen.doc.text(
        new Date(lease.endDate).toLocaleDateString('en-GB'),
        320,
        gen.y
      );
      gen.doc.text(
        `LKR ${fromCents(lease.monthlyRent || 0).toLocaleString()}`,
        410,
        gen.y,
        { width: 70, align: 'right' }
      );
      gen.doc
        .fillColor(lease.urgencyColor)
        .font('Helvetica-Bold')
        .text(`${lease.diffDays} days`, 490, gen.y, {
          width: 60,
          align: 'right',
        });
      gen.doc.font('Helvetica').fillColor('black');
      gen.y += 22;
    }

    // 5. [VISUAL] Renewal Strategy
    gen.drawInsights(data.insights);

    gen.finalize();
  });

  // =========================================================================
  //  6. LEAD CONVERSION ANALYTICS REPORT
  // =========================================================================
  // LEAD CONVERSION REPORT: Generates a PDF showing how many inquiries turn into signed leases.
  generateLeadConversionReport = catchAsync(async (req, res, next) => {
    // 1. [TRANSFORMATION] Period resolution via shared utility (S1 fix)
    // Default title is 'All Time' when no period params are supplied
    const { year, month, startDate, endDate, periodTitle } = resolvePeriod(
      req.query,
      req.query.year || req.query.month ? null : 'All Time'
    );

    // 2. [DELEGATION] Funnel Analysis: Compare leads to applications to signed contracts
    const data = await reportService.getLeadConversionReportData(
      req.user,
      startDate,
      endDate
    );

    // 3. [ORCHESTRATION] PDF Generation
    const gen = new ReportGenerator(
      res,
      'marketing_funnel_report.pdf',
      `Lead Conversion & Pipeline Analysis — ${periodTitle}`,
      'Marketing efficiency, lead-to-lease conversion rates, and pipeline health metrics'
    );

    gen.generateHeader();

    // 4. [VISUAL] KPI Panel
    gen.drawKpiPanel([
      { label: 'TOTAL LEADS', value: `${data.stats.Total}`, color: '#2563eb' },
      {
        label: 'CONVERTED',
        value: `${data.stats.Converted}`,
        color: '#22c55e',
      },
      {
        label: 'CONVERSION RATE',
        value: `${data.convRate}%`,
        color: Number(data.convRate) >= 20 ? '#22c55e' : '#f59e0b',
      },
      { label: 'DROPPED', value: `${data.stats.Dropped}`, color: '#ef4444' },
    ]);

    // 5. [VISUAL] Funnel Visualization: Draw the drop-off at each stage of the prospect journey
    gen.drawSectionTitle('Marketing Funnel Breakdown');

    const funnel = [
      {
        label: 'Total Inquiries (Leads Captured)',
        value: data.stats.Total,
        pct: '100%',
        color: '#2563eb',
      },
      {
        label: 'Qualified Interest (In-Progress)',
        value: data.stats.Interested,
        pct:
          data.stats.Total > 0
            ? ((data.stats.Interested / data.stats.Total) * 100).toFixed(1) +
              '%'
            : '0%',
        color: '#7c3aed',
      },
      {
        label: 'Lease Conversions (Successful)',
        value: data.stats.Converted,
        pct: data.convRate + '%',
        color: '#22c55e',
      },
      {
        label: 'Dropped Inquiries (Lost Opportunities)',
        value: data.stats.Dropped,
        pct: data.dropRate + '%',
        color: '#ef4444',
      },
    ];

    funnel.forEach((item) => {
      gen.checkPageBreak(50);
      const barWidth =
        data.stats.Total > 0 ? (item.value / data.stats.Total) * 400 : 0;
      gen.doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#1e293b')
        .text(item.label, 50, gen.y);
      gen.doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#64748b')
        .text(`${item.value} units`, 400, gen.y, {
          width: 150,
          align: 'right',
        });
      gen.y += 16;
      gen.doc.save();
      gen.doc.roundedRect(50, gen.y, 400, 12, 6).fill('#f1f5f9');
      if (barWidth > 0)
        gen.doc
          .roundedRect(50, gen.y, Math.max(10, barWidth), 12, 6)
          .fill(item.color);
      gen.doc.restore();
      gen.doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(item.color)
        .text(item.pct, 460, gen.y + 1);
      gen.y += 28;
    });

    // 6. [VISUAL] Marketing Insights
    gen.drawInsights(data.insights);

    gen.finalize();
  });

  // =========================================================================
  //  JSON ENDPOINTS
  // =========================================================================

  // GET LEDGER SUMMARY: JSON data for the dashboard charts (Income vs Expense).
  getLedgerSummary = catchAsync(async (req, res, next) => {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = req.query.month ? parseInt(req.query.month) : null;

    let startDate = null;
    let endDate = null;

    // 1. [TRANSFORMATION]
    if (month) {
      const lastDay = new Date(year, month, 0).getDate();
      startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }

    // 2. [DELEGATION] Computation resolver
    const summary = await reportService.getLedgerSummary(
      year,
      req.user,
      startDate,
      endDate
    );
    res.json(summary);
  });

  // GET MONTHLY CASH FLOW: JSON data for the trend line charts.
  getMonthlyCashFlow = catchAsync(async (req, res, next) => {
    // 1. [DELEGATION] Time-series aggregation
    const stats = await reportService.getMonthlyCashFlow(req.user);
    res.json(stats);
  });
}

export default new ReportController();
