import reportService from '../services/reportService.js';
import { getLocalTime, parseLocalDate } from '../utils/dateUtils.js';
import ReportGenerator from '../utils/pdfGenerator.js';
import { fromCents } from '../utils/moneyUtils.js';
import catchAsync from '../utils/catchAsync.js';

class ReportController {
  // =========================================================================
  //  1. FINANCIAL PERFORMANCE REPORT
  // =========================================================================
  generateFinancialReport = catchAsync(async (req, res, next) => {
    const year = req.query.year || new Date().getFullYear();
    const data = await reportService.getFinancialReportData(year, req.user);

    const gen = new ReportGenerator(
      res,
      `financial_report_${year}.pdf`,
      `Financial Performance Report — ${year}`,
      'Income, expense breakdown, and profitability analysis by property'
    );

    gen.generateHeader();

    // --- KPI Panel ---
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

    // --- Property Breakdown Table ---
    gen.drawSectionTitle('Property Breakdown');

    gen.doc.fontSize(9).font('Helvetica-Bold');
    gen.doc.text('Property', 50, gen.y);
    gen.doc.text('Income', 200, gen.y, { width: 85, align: 'right' });
    gen.doc.text('Expenses', 285, gen.y, { width: 85, align: 'right' });
    gen.doc.text('Net Income', 370, gen.y, { width: 110, align: 'right' });
    gen.doc.text('Margin', 485, gen.y, { width: 65, align: 'right' });
    gen.doc
      .moveTo(50, gen.y + 14)
      .lineTo(550, gen.y + 14)
      .strokeColor('#e2e8f0')
      .stroke();
    gen.y += 22;

    gen.doc.font('Helvetica').fontSize(9);
    for (const p of data.propertyMetrics) {
      gen.checkPageBreak(20);
      const isLoss = p.net < 0;
      gen.doc.fillColor('#334155').text(p.name, 50, gen.y, { width: 145 });
      gen.doc.text(`LKR ${fromCents(p.income).toLocaleString()}`, 200, gen.y, {
        width: 85,
        align: 'right',
      });
      gen.doc.text(`LKR ${fromCents(p.expense).toLocaleString()}`, 285, gen.y, {
        width: 85,
        align: 'right',
      });
      gen.doc
        .fillColor(isLoss ? '#ef4444' : '#22c55e')
        .text(`LKR ${fromCents(p.net).toLocaleString()}`, 370, gen.y, {
          width: 110,
          align: 'right',
        });

      gen.doc
        .fillColor(
          p.margin < 10 ? '#ef4444' : p.margin < 30 ? '#f59e0b' : '#22c55e'
        )
        .text(`${p.margin}%`, 485, gen.y, { width: 65, align: 'right' });
      gen.doc.fillColor('black');
      gen.y += 18;
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
      {
        width: 85,
        align: 'right',
      }
    );
    gen.doc.text(
      `LKR ${fromCents(data.totalExpense).toLocaleString()}`,
      285,
      gen.y,
      {
        width: 85,
        align: 'right',
      }
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

    // --- Insights & Recommendations ---
    gen.drawInsights(data.insights);

    gen.finalize();
  });

  // =========================================================================
  //  2. OCCUPANCY REPORT
  // =========================================================================
  generateOccupancyReport = catchAsync(async (req, res, next) => {
    const data = await reportService.getOccupancyReportData(req.user);

    const gen = new ReportGenerator(
      res,
      'occupancy_report.pdf',
      'Occupancy Report',
      'Unit occupancy rates, vacancy analysis, and revenue impact assessment'
    );

    gen.generateHeader();

    // --- KPI Panel ---
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

    // --- Property Details ---
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

    // --- Recommendations ---
    gen.drawInsights(data.insights);

    gen.finalize();
  });

  // =========================================================================
  //  3. TENANT RISK PROFILE REPORT
  // =========================================================================
  generateTenantRiskReport = catchAsync(async (req, res, next) => {
    const data = await reportService.getTenantRiskStats(req.user);

    const gen = new ReportGenerator(
      res,
      'tenant_risk_report.pdf',
      'Tenant Risk Profile',
      'Behavior score analysis, payment reliability assessment, and risk-based action plan'
    );

    gen.generateHeader();

    // --- KPI Panel ---
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

    // --- Tenant Table ---
    gen.drawSectionTitle('Tenant Risk Assessment');

    gen.doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b');
    gen.doc.text('Tenant Name', 50, gen.y);
    gen.doc.text('Score', 220, gen.y, { width: 50, align: 'center' });
    gen.doc.text('Overdue', 280, gen.y, { width: 50, align: 'center' });
    gen.doc.text('Paid', 340, gen.y, { width: 50, align: 'center' });
    gen.doc.text('Risk Level', 410, gen.y, { width: 70, align: 'center' });
    gen.doc.text('Action', 485, gen.y, { width: 70, align: 'center' });
    gen.doc
      .moveTo(50, gen.y + 14)
      .lineTo(550, gen.y + 14)
      .strokeColor('#e2e8f0')
      .stroke();
    gen.y += 22;

    gen.doc.font('Helvetica').fontSize(9);
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

      gen.doc.fillColor('#334155').text(tenant.name, 50, gen.y, { width: 165 });
      gen.doc
        .fillColor(
          tenant.behavior_score < 50
            ? '#ef4444'
            : tenant.behavior_score < 70
              ? '#f59e0b'
              : '#334155'
        )
        .text(tenant.behavior_score.toString(), 220, gen.y, {
          width: 50,
          align: 'center',
        });
      gen.doc
        .fillColor(tenant.overdue_count > 0 ? '#ef4444' : '#334155')
        .text(tenant.overdue_count.toString(), 280, gen.y, {
          width: 50,
          align: 'center',
        });
      gen.doc
        .fillColor('#334155')
        .text(tenant.paid_count.toString(), 340, gen.y, {
          width: 50,
          align: 'center',
        });
      gen.doc
        .fillColor(tenant.color)
        .font('Helvetica-Bold')
        .text(tenant.riskLevel, 410, gen.y, { width: 70, align: 'center' });
      gen.doc
        .fillColor(actionColor)
        .font('Helvetica-Bold')
        .text(action, 485, gen.y, { width: 70, align: 'center' });
      gen.doc.font('Helvetica').fillColor('black');
      gen.y += 18;
    }

    // --- Recommendations ---
    gen.drawInsights(data.insights);

    gen.finalize();
  });

  // =========================================================================
  //  4. MAINTENANCE COST ANALYSIS REPORT
  // =========================================================================
  generateMaintenanceCategoryReport = catchAsync(async (req, res, next) => {
    const year = req.query.year || new Date().getFullYear();
    const data = await reportService.getMaintenanceReportData(req.user, year);

    const gen = new ReportGenerator(
      res,
      'maintenance_category_report.pdf',
      'Maintenance Cost Analysis',
      'Expense categorization, cost concentration analysis, and budget optimization insights'
    );

    gen.generateHeader();

    // --- KPI Panel ---
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
      // --- Category Breakdown Table ---
      gen.drawSectionTitle('Cost Breakdown by Category');

      const barColors = [
        '#2563eb',
        '#7c3aed',
        '#06b6d4',
        '#f59e0b',
        '#ef4444',
        '#22c55e',
        '#64748b',
      ];
      gen.doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b');
      gen.doc.text('Category', 50, gen.y);
      gen.doc.text('Amount (LKR)', 200, gen.y, { width: 90, align: 'right' });
      gen.doc.text('Share', 300, gen.y, { width: 50, align: 'right' });
      gen.doc.text('Distribution', 370, gen.y, { width: 180 });
      gen.doc
        .moveTo(50, gen.y + 14)
        .lineTo(550, gen.y + 14)
        .strokeColor('#e2e8f0')
        .stroke();
      gen.y += 22;

      gen.doc.font('Helvetica').fontSize(9);
      data.sorted.forEach(([cat, amount], index) => {
        gen.checkPageBreak(22);
        const percent = ((amount / data.totalCost) * 100).toFixed(1);
        const barWidth = Math.max(2, (amount / data.totalCost) * 180);
        const barColor = barColors[index % barColors.length];

        gen.doc.fillColor('#334155').text(cat, 50, gen.y, { width: 145 });
        gen.doc.text(fromCents(amount).toLocaleString(), 200, gen.y, {
          width: 90,
          align: 'right',
        });
        gen.doc.text(`${percent}%`, 300, gen.y, { width: 50, align: 'right' });
        gen.doc.save();
        gen.doc.roundedRect(370, gen.y + 1, barWidth, 10, 3).fill(barColor);
        gen.doc.restore();
        gen.doc.fillColor('black');
        gen.y += 22;
      });
      gen.y += 10;
    }

    // --- Recommendations ---
    gen.drawInsights(data.insights);

    gen.finalize();
  });

  // =========================================================================
  //  5. LEASE EXPIRATION FORECAST REPORT
  // =========================================================================
  generateLeaseExpirationReport = catchAsync(async (req, res, next) => {
    const data = await reportService.getLeaseExpirationReportData(req.user);

    const gen = new ReportGenerator(
      res,
      'lease_expiration_report.pdf',
      'Lease Expiration Forecast',
      '90-day expiration pipeline, renewal urgency analysis, and revenue-at-risk assessment'
    );

    gen.generateHeader();

    // --- KPI Panel ---
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

    // --- Expiration Table ---
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

    // --- Recommendations ---
    gen.drawInsights(data.insights);

    gen.finalize();
  });

  // =========================================================================
  //  6. LEAD CONVERSION ANALYTICS REPORT
  // =========================================================================
  generateLeadConversionReport = catchAsync(async (req, res, next) => {
    const data = await reportService.getLeadConversionReportData(req.user);

    const gen = new ReportGenerator(
      res,
      'marketing_funnel_report.pdf',
      'Lead Conversion & Pipeline Analysis',
      'Marketing efficiency, lead-to-lease conversion rates, and pipeline health metrics'
    );

    gen.generateHeader();

    // --- KPI Panel ---
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

    // --- Funnel Visualization ---
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

    // --- Recommendations ---
    gen.drawInsights(data.insights);

    gen.finalize();
  });

  // =========================================================================
  //  JSON ENDPOINTS
  // =========================================================================

  getLedgerSummary = catchAsync(async (req, res, next) => {
    const year = req.query.year || new Date().getFullYear();
    const summary = await reportService.getLedgerSummary(year, req.user);
    res.json(summary);
  });

  getMonthlyCashFlow = catchAsync(async (req, res, next) => {
    const stats = await reportService.getMonthlyCashFlow(req.user);
    res.json(stats);
  });
}

export default new ReportController();
