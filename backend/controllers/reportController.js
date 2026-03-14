
import PDFDocument from 'pdfkit';
import reportService from '../services/reportService.js';

// ============================================================================
//  PDF HELPER UTILITIES
// ============================================================================

/** Draw a colored rounded KPI box */
function drawKpiBox(doc, x, y, width, label, value, color = '#2563eb') {
  doc.save();
  doc.roundedRect(x, y, width, 55, 6).fill(color);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(18).text(value, x, y + 8, { width, align: 'center' });
  doc.fillColor('white').font('Helvetica').fontSize(9).text(label, x, y + 32, { width, align: 'center' });
  doc.restore();
  doc.fillColor('black').font('Helvetica');
}

/** Draw a section title with a colored left border */
function drawSectionTitle(doc, y, title) {
  doc.save();
  doc.rect(50, y, 4, 18).fill('#2563eb');
  doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(13).text(title, 62, y + 1);
  doc.restore();
  doc.fillColor('black').font('Helvetica').fontSize(10);
  return y + 28;
}

/** Draw a recommendation box with icon */
function drawRecommendation(doc, y, text, urgency = 'info') {
  const colors = { info: '#2563eb', warning: '#f59e0b', critical: '#ef4444', success: '#22c55e' };
  const bgColors = { info: '#eff6ff', warning: '#fffbeb', critical: '#fef2f2', success: '#f0fdf4' };
  const icons = { info: 'ℹ', warning: '⚠', critical: '⚠', success: '✓' };
  const color = colors[urgency] || colors.info;
  const bgColor = bgColors[urgency] || bgColors.info;

  doc.save();
  doc.roundedRect(50, y, 500, 40, 4).fill(bgColor);
  doc.roundedRect(50, y, 4, 40, 0).fill(color);
  doc.fillColor(color).font('Helvetica-Bold').fontSize(10).text(icons[urgency], 62, y + 5);
  doc.fillColor('#334155').font('Helvetica').fontSize(9).text(text, 76, y + 6, { width: 460, lineGap: 3 });
  doc.restore();
  doc.fillColor('black').font('Helvetica').fontSize(10);
  return y + 50;
}

/** Draw the report header with title, subtitle and generation timestamp */
function drawReportHeader(doc, title, subtitle) {
  doc.fontSize(22).font('Helvetica-Bold').fillColor('#1e293b').text(title, { align: 'center' });
  doc.moveDown(0.2);
  doc.fontSize(10).font('Helvetica').fillColor('#64748b').text(subtitle, { align: 'center' });
  doc.fontSize(9).text(`Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, { align: 'center' });
  doc.fillColor('black').font('Helvetica').fontSize(10);
}

/** Check page overflow and add page if needed */
function checkPageBreak(doc, y, needed = 60) {
  if (y + needed > 720) {
    doc.addPage();
    return 50;
  }
  return y;
}

class ReportController {

  // =========================================================================
  //  1. FINANCIAL PERFORMANCE REPORT
  // =========================================================================
  async generateFinancialReport(req, res) {
    try {
      const year = req.query.year || new Date().getFullYear();
      const propertyStats = await reportService.getFinancialStats(year, req.user);

      const doc = new PDFDocument({ margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=financial_report_${year}.pdf`);
      doc.pipe(res);

      // --- Header ---
      drawReportHeader(doc, `Financial Performance Report — ${year}`, 'Income, expense breakdown, and profitability analysis by property');
      doc.moveDown(0.5);

      // --- Compute Aggregates ---
      let totalIncome = 0, totalExpense = 0;
      const entries = Object.entries(propertyStats);
      const propertyMetrics = entries.map(([name, stats]) => {
        const net = stats.income - stats.expense;
        const margin = stats.income > 0 ? ((net / stats.income) * 100).toFixed(1) : '0.0';
        totalIncome += stats.income;
        totalExpense += stats.expense;
        return { name, income: stats.income, expense: stats.expense, net, margin: Number(margin) };
      });
      const totalNet = totalIncome - totalExpense;
      const totalMargin = totalIncome > 0 ? ((totalNet / totalIncome) * 100).toFixed(1) : '0.0';

      // --- KPI Panel ---
      let y = doc.y + 5;
      const kpiWidth = 120;
      drawKpiBox(doc, 50, y, kpiWidth, 'TOTAL REVENUE', `LKR ${totalIncome.toLocaleString()}`, '#22c55e');
      drawKpiBox(doc, 180, y, kpiWidth, 'TOTAL EXPENSES', `LKR ${totalExpense.toLocaleString()}`, '#ef4444');
      drawKpiBox(doc, 310, y, kpiWidth, 'NET INCOME', `LKR ${totalNet.toLocaleString()}`, totalNet >= 0 ? '#2563eb' : '#ef4444');
      drawKpiBox(doc, 440, y, kpiWidth, 'PROFIT MARGIN', `${totalMargin}%`, Number(totalMargin) >= 20 ? '#22c55e' : '#f59e0b');
      y += 70;

      // --- Property Breakdown Table ---
      y = drawSectionTitle(doc, y, 'Property Breakdown');

      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('Property', 50, y);
      doc.text('Income', 220, y, { width: 80, align: 'right' });
      doc.text('Expenses', 310, y, { width: 80, align: 'right' });
      doc.text('Net Income', 400, y, { width: 80, align: 'right' });
      doc.text('Margin', 490, y, { width: 60, align: 'right' });
      doc.moveTo(50, y + 14).lineTo(550, y + 14).strokeColor('#e2e8f0').stroke();
      y += 22;

      doc.font('Helvetica').fontSize(9);
      for (const p of propertyMetrics) {
        y = checkPageBreak(doc, y, 20);
        const isLoss = p.net < 0;
        doc.fillColor('#334155').text(p.name, 50, y, { width: 165 });
        doc.text(`LKR ${p.income.toLocaleString()}`, 220, y, { width: 80, align: 'right' });
        doc.text(`LKR ${p.expense.toLocaleString()}`, 310, y, { width: 80, align: 'right' });
        doc.fillColor(isLoss ? '#ef4444' : '#22c55e').text(`LKR ${p.net.toLocaleString()}`, 400, y, { width: 80, align: 'right' });
        doc.fillColor(p.margin < 10 ? '#ef4444' : p.margin < 30 ? '#f59e0b' : '#22c55e').text(`${p.margin}%`, 490, y, { width: 60, align: 'right' });
        doc.fillColor('black');
        y += 18;
      }

      doc.moveTo(50, y).lineTo(550, y).strokeColor('#e2e8f0').stroke();
      y += 8;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('TOTAL', 50, y);
      doc.text(`LKR ${totalIncome.toLocaleString()}`, 220, y, { width: 80, align: 'right' });
      doc.text(`LKR ${totalExpense.toLocaleString()}`, 310, y, { width: 80, align: 'right' });
      doc.fillColor(totalNet >= 0 ? '#22c55e' : '#ef4444').text(`LKR ${totalNet.toLocaleString()}`, 400, y, { width: 80, align: 'right' });
      doc.fillColor('#1e293b').text(`${totalMargin}%`, 490, y, { width: 60, align: 'right' });
      doc.fillColor('black');
      y += 30;

      // --- Insights & Recommendations ---
      y = checkPageBreak(doc, y, 100);
      y = drawSectionTitle(doc, y, 'Insights & Recommendations');

      if (entries.length === 0) {
        y = drawRecommendation(doc, y, 'No financial data available for this year. Ensure invoices are being generated and payments recorded.', 'warning');
      } else {
        const lossProperties = propertyMetrics.filter(p => p.net < 0);
        const best = propertyMetrics.reduce((a, b) => a.margin > b.margin ? a : b);
        const worst = propertyMetrics.reduce((a, b) => a.margin < b.margin ? a : b);

        if (lossProperties.length > 0) {
          y = drawRecommendation(doc, y, `${lossProperties.length} propert${lossProperties.length > 1 ? 'ies are' : 'y is'} running at a loss: ${lossProperties.map(p => p.name).join(', ')}. Review expense allocation and consider rent adjustments or cost-cutting measures.`, 'critical');
        } else {
          y = drawRecommendation(doc, y, `All properties are profitable. Best performer: "${best.name}" at ${best.margin}% margin.`, 'success');
        }

        if (propertyMetrics.length > 1 && best.name !== worst.name) {
          y = checkPageBreak(doc, y, 50);
          y = drawRecommendation(doc, y, `Lowest margin property: "${worst.name}" at ${worst.margin}%. Consider investigating operational costs or increasing occupancy to improve returns.`, worst.margin < 10 ? 'warning' : 'info');
        }

        if (Number(totalMargin) < 15) {
          y = checkPageBreak(doc, y, 50);
          y = drawRecommendation(doc, y, `Overall profit margin (${totalMargin}%) is below the 15% healthy threshold. Evaluate portfolio-wide expense reduction strategies.`, 'warning');
        }
      }

      doc.end();
    } catch (error) {
      console.error('Error generating financial report:', error);
      res.status(500).json({ error: 'Failed to generate financial report' });
    }
  }

  // =========================================================================
  //  2. OCCUPANCY REPORT
  // =========================================================================
  async generateOccupancyReport(req, res) {
    try {
      const propertyStats = await reportService.getOccupancyStats(req.user);
      const doc = new PDFDocument({ margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=occupancy_report.pdf`);
      doc.pipe(res);

      drawReportHeader(doc, 'Occupancy Report', 'Unit occupancy rates, vacancy analysis, and revenue impact assessment');
      doc.moveDown(0.5);

      // --- Compute Aggregates ---
      const entries = Object.entries(propertyStats);
      let totalUnits = 0, totalOccupied = 0, totalVacant = 0;
      const propertyMetrics = entries.map(([name, stats]) => {
        const rate = stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0;
        totalUnits += stats.total;
        totalOccupied += stats.occupied;
        totalVacant += stats.vacancies.length;
        return { name, total: stats.total, occupied: stats.occupied, vacancies: stats.vacancies, rate };
      });
      const portfolioRate = totalUnits > 0 ? Math.round((totalOccupied / totalUnits) * 100) : 0;

      // --- KPI Panel ---
      let y = doc.y + 5;
      const kpiWidth = 120;
      drawKpiBox(doc, 50, y, kpiWidth, 'PORTFOLIO OCCUPANCY', `${portfolioRate}%`, portfolioRate >= 90 ? '#22c55e' : portfolioRate >= 70 ? '#f59e0b' : '#ef4444');
      drawKpiBox(doc, 180, y, kpiWidth, 'TOTAL UNITS', `${totalUnits}`, '#2563eb');
      drawKpiBox(doc, 310, y, kpiWidth, 'OCCUPIED', `${totalOccupied}`, '#22c55e');
      drawKpiBox(doc, 440, y, kpiWidth, 'VACANT', `${totalVacant}`, totalVacant === 0 ? '#22c55e' : '#ef4444');
      y += 70;

      // --- Property Details ---
      y = drawSectionTitle(doc, y, 'Property-Level Analysis');

      for (const p of propertyMetrics) {
        y = checkPageBreak(doc, y, 80);
        const rateColor = p.rate >= 90 ? '#22c55e' : p.rate >= 70 ? '#f59e0b' : '#ef4444';
        const urgency = p.rate >= 90 ? 'Healthy' : p.rate >= 70 ? 'Needs Attention' : 'Critical';

        doc.font('Helvetica-Bold').fontSize(11).fillColor('#1e293b').text(p.name, 50, y);
        doc.font('Helvetica-Bold').fontSize(10).fillColor(rateColor).text(`${p.rate}% — ${urgency}`, 400, y, { width: 150, align: 'right' });
        y += 18;
        doc.font('Helvetica').fontSize(9).fillColor('#64748b');
        doc.text(`${p.occupied} of ${p.total} units occupied`, 50, y);
        y += 14;

        if (p.vacancies.length > 0) {
          doc.fillColor('#ef4444').text(`Vacant units: ${p.vacancies.join(', ')}`, 50, y);
          y += 14;
        }
        doc.fillColor('black');
        doc.moveTo(50, y + 2).lineTo(550, y + 2).strokeColor('#f1f5f9').stroke();
        y += 12;
      }

      // --- Recommendations ---
      y = checkPageBreak(doc, y, 100);
      y = drawSectionTitle(doc, y, 'Insights & Recommendations');

      if (entries.length === 0) {
        y = drawRecommendation(doc, y, 'No property data available. Ensure properties and units are registered in the system.', 'warning');
      } else if (totalVacant === 0) {
        y = drawRecommendation(doc, y, 'Excellent — all units across your portfolio are fully occupied. Consider evaluating rent pricing for the next renewal cycle.', 'success');
      } else {
        const worstProperty = propertyMetrics.reduce((a, b) => a.rate < b.rate ? a : b);
        y = drawRecommendation(doc, y, `${totalVacant} vacant unit${totalVacant > 1 ? 's' : ''} across your portfolio. Prioritize filling vacancies at "${worstProperty.name}" (${worstProperty.rate}% occupancy). Each month of vacancy is lost rental income.`, 'critical');

        const lowProperties = propertyMetrics.filter(p => p.rate < 70);
        if (lowProperties.length > 0) {
          y = checkPageBreak(doc, y, 50);
          y = drawRecommendation(doc, y, `${lowProperties.length} propert${lowProperties.length > 1 ? 'ies have' : 'y has'} occupancy below 70%. Consider adjusting pricing, improving marketing, or reviewing unit conditions.`, 'warning');
        }
      }

      doc.end();
    } catch (error) {
      console.error('Error generating occupancy report:', error);
      res.status(500).json({ error: 'Failed to generate occupancy report' });
    }
  }

  // =========================================================================
  //  3. TENANT RISK PROFILE REPORT
  // =========================================================================
  async generateTenantRiskReport(req, res) {
    try {
      const tenants = await reportService.getTenantRiskStats(req.user);
      const doc = new PDFDocument({ margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=tenant_risk_report.pdf`);
      doc.pipe(res);

      drawReportHeader(doc, 'Tenant Risk Profile', 'Behavior score analysis, payment reliability assessment, and risk-based action plan');
      doc.moveDown(0.5);

      // --- Compute Aggregates ---
      const highRisk = tenants.filter(t => t.riskLevel === 'High');
      const medRisk = tenants.filter(t => t.riskLevel === 'Medium');
      const lowRisk = tenants.filter(t => t.riskLevel === 'Low');
      const avgScore = tenants.length > 0 ? Math.round(tenants.reduce((s, t) => s + t.behavior_score, 0) / tenants.length) : 0;

      // --- KPI Panel ---
      let y = doc.y + 5;
      const kpiWidth = 120;
      drawKpiBox(doc, 50, y, kpiWidth, 'TOTAL TENANTS', `${tenants.length}`, '#2563eb');
      drawKpiBox(doc, 180, y, kpiWidth, 'HIGH RISK', `${highRisk.length}`, highRisk.length > 0 ? '#ef4444' : '#22c55e');
      drawKpiBox(doc, 310, y, kpiWidth, 'MEDIUM RISK', `${medRisk.length}`, medRisk.length > 0 ? '#f59e0b' : '#22c55e');
      drawKpiBox(doc, 440, y, kpiWidth, 'AVG SCORE', `${avgScore}/100`, avgScore >= 70 ? '#22c55e' : avgScore >= 50 ? '#f59e0b' : '#ef4444');
      y += 70;

      // --- Tenant Table ---
      y = drawSectionTitle(doc, y, 'Tenant Risk Assessment');

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b');
      doc.text('Tenant Name', 50, y);
      doc.text('Score', 220, y, { width: 50, align: 'center' });
      doc.text('Overdue', 280, y, { width: 50, align: 'center' });
      doc.text('Paid', 340, y, { width: 50, align: 'center' });
      doc.text('Risk Level', 410, y, { width: 70, align: 'center' });
      doc.text('Action', 485, y, { width: 70, align: 'center' });
      doc.moveTo(50, y + 14).lineTo(550, y + 14).strokeColor('#e2e8f0').stroke();
      y += 22;

      doc.font('Helvetica').fontSize(9);
      for (const tenant of tenants) {
        y = checkPageBreak(doc, y, 20);
        const action = tenant.riskLevel === 'High' ? 'Escalate' : tenant.riskLevel === 'Medium' ? 'Monitor' : 'No action';
        const actionColor = tenant.riskLevel === 'High' ? '#ef4444' : tenant.riskLevel === 'Medium' ? '#f59e0b' : '#22c55e';

        doc.fillColor('#334155').text(tenant.name, 50, y, { width: 165 });
        doc.fillColor(tenant.behavior_score < 50 ? '#ef4444' : tenant.behavior_score < 70 ? '#f59e0b' : '#334155');
        doc.text(tenant.behavior_score.toString(), 220, y, { width: 50, align: 'center' });
        doc.fillColor(tenant.overdue_count > 0 ? '#ef4444' : '#334155').text(tenant.overdue_count.toString(), 280, y, { width: 50, align: 'center' });
        doc.fillColor('#334155').text(tenant.paid_count.toString(), 340, y, { width: 50, align: 'center' });
        doc.fillColor(tenant.color).font('Helvetica-Bold').text(tenant.riskLevel, 410, y, { width: 70, align: 'center' });
        doc.fillColor(actionColor).font('Helvetica-Bold').text(action, 485, y, { width: 70, align: 'center' });
        doc.font('Helvetica').fillColor('black');
        y += 18;
      }
      y += 10;

      // --- Recommendations ---
      y = checkPageBreak(doc, y, 100);
      y = drawSectionTitle(doc, y, 'Insights & Recommendations');

      if (tenants.length === 0) {
        y = drawRecommendation(doc, y, 'No active tenants found. Ensure leases are active and tenants are registered.', 'warning');
      } else if (highRisk.length > 0) {
        y = drawRecommendation(doc, y, `${highRisk.length} tenant${highRisk.length > 1 ? 's require' : ' requires'} immediate attention: ${highRisk.map(t => t.name).join(', ')}. Schedule meetings to discuss payment plans. Consider issuing formal warnings for tenants with 3+ overdue invoices.`, 'critical');
      } else if (medRisk.length > 0) {
        y = drawRecommendation(doc, y, `${medRisk.length} tenant${medRisk.length > 1 ? 's are' : ' is'} at medium risk. Proactively monitor payment patterns and schedule check-ins before they escalate.`, 'warning');
      } else {
        y = drawRecommendation(doc, y, `All ${tenants.length} tenants are in good standing. Average behavior score: ${avgScore}/100. Portfolio risk is minimal.`, 'success');
      }

      if (avgScore < 60 && tenants.length > 0) {
        y = checkPageBreak(doc, y, 50);
        y = drawRecommendation(doc, y, `Portfolio average behavior score (${avgScore}/100) is below healthy levels. Review tenant screening criteria for future leases.`, 'warning');
      }

      doc.end();
    } catch (error) {
      console.error('Error generating tenant risk report:', error);
      res.status(500).json({ error: 'Failed to generate tenant risk report' });
    }
  }

  // =========================================================================
  //  4. MAINTENANCE COST ANALYSIS REPORT
  // =========================================================================
  async generateMaintenanceCategoryReport(req, res) {
    try {
      const { categories, totalCost } = await reportService.getMaintenanceCategoryStats(req.user);
      const doc = new PDFDocument({ margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=maintenance_category_report.pdf`);
      doc.pipe(res);

      drawReportHeader(doc, 'Maintenance Cost Analysis', 'Expense categorization, cost concentration analysis, and budget optimization insights');
      doc.moveDown(0.5);

      const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
      const categoryCount = sorted.length;
      const topCategory = sorted.length > 0 ? sorted[0] : null;
      const topPct = topCategory && totalCost > 0 ? ((topCategory[1] / totalCost) * 100).toFixed(1) : '0';

      // --- KPI Panel ---
      let y = doc.y + 5;
      const kpiWidth = 120;
      drawKpiBox(doc, 50, y, kpiWidth, 'TOTAL SPEND', totalCost > 0 ? `LKR ${totalCost.toLocaleString()}` : 'LKR 0', totalCost > 0 ? '#ef4444' : '#22c55e');
      drawKpiBox(doc, 180, y, kpiWidth, 'CATEGORIES', `${categoryCount}`, '#2563eb');
      drawKpiBox(doc, 310, y, kpiWidth, 'TOP CATEGORY', topCategory ? topCategory[0] : 'N/A', '#f59e0b');
      drawKpiBox(doc, 440, y, kpiWidth, 'TOP CATEGORY %', `${topPct}%`, Number(topPct) > 50 ? '#ef4444' : '#22c55e');
      y += 70;

      if (totalCost === 0) {
        y = drawSectionTitle(doc, y, 'Analysis');
        y = drawRecommendation(doc, y, 'No maintenance costs have been recorded. This report will populate as maintenance expenses are logged.', 'info');
      } else {
        // --- Category Breakdown Table ---
        y = drawSectionTitle(doc, y, 'Cost Breakdown by Category');

        const barColors = ['#2563eb', '#7c3aed', '#06b6d4', '#f59e0b', '#ef4444', '#22c55e', '#64748b'];
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b');
        doc.text('Category', 50, y);
        doc.text('Amount (LKR)', 200, y, { width: 90, align: 'right' });
        doc.text('Share', 300, y, { width: 50, align: 'right' });
        doc.text('Distribution', 370, y, { width: 180 });
        doc.moveTo(50, y + 14).lineTo(550, y + 14).strokeColor('#e2e8f0').stroke();
        y += 22;

        doc.font('Helvetica').fontSize(9);
        sorted.forEach(([cat, amount], index) => {
          y = checkPageBreak(doc, y, 22);
          const percent = ((amount / totalCost) * 100).toFixed(1);
          const barWidth = Math.max(2, (amount / totalCost) * 180);
          const barColor = barColors[index % barColors.length];

          doc.fillColor('#334155').text(cat, 50, y, { width: 145 });
          doc.text(amount.toLocaleString(), 200, y, { width: 90, align: 'right' });
          doc.text(`${percent}%`, 300, y, { width: 50, align: 'right' });
          doc.save();
          doc.roundedRect(370, y + 1, barWidth, 10, 3).fill(barColor);
          doc.restore();
          doc.fillColor('black');
          y += 22;
        });
        y += 10;

        // --- Recommendations ---
        y = checkPageBreak(doc, y, 100);
        y = drawSectionTitle(doc, y, 'Insights & Recommendations');

        if (Number(topPct) > 50) {
          y = drawRecommendation(doc, y, `"${topCategory[0]}" accounts for ${topPct}% of total maintenance spend (LKR ${topCategory[1].toLocaleString()}). This concentration suggests a systemic issue — consider preventive maintenance or vendor renegotiation for this category.`, 'critical');
        } else if (Number(topPct) > 30) {
          y = drawRecommendation(doc, y, `"${topCategory[0]}" is the largest expense at ${topPct}%. Monitor this category quarterly for trends and consider bulk service contracts.`, 'warning');
        } else {
          y = drawRecommendation(doc, y, `Maintenance costs are well-distributed across ${categoryCount} categories. No single category dominates spending. Continue routine preventive maintenance.`, 'success');
        }

        if (categoryCount === 1) {
          y = checkPageBreak(doc, y, 50);
          y = drawRecommendation(doc, y, 'Only one maintenance category detected. Ensure cost descriptions are detailed enough for accurate auto-categorization.', 'info');
        }
      }

      doc.end();
    } catch (error) {
      console.error('Error generating maintenance report:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  }

  // =========================================================================
  //  5. LEASE EXPIRATION FORECAST REPORT
  // =========================================================================
  async generateLeaseExpirationReport(req, res) {
    try {
      const expiringLeases = await reportService.getLeaseExpirationStats(req.user);
      const doc = new PDFDocument({ margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=lease_expiration_forecast.pdf`);
      doc.pipe(res);

      drawReportHeader(doc, 'Lease Expiration Forecast', 'Upcoming lease renewals, revenue at risk, and urgency-based action plan (next 90 days)');
      doc.moveDown(0.5);

      // --- Compute Aggregates with Urgency Tiers ---
      const now = new Date();
      const leasesWithDays = expiringLeases.map(lease => {
        const endDate = new Date(lease.endDate);
        const diffDays = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
        let urgency = 'upcoming', urgencyColor = '#334155';
        if (diffDays <= 14) { urgency = 'critical'; urgencyColor = '#ef4444'; }
        else if (diffDays <= 30) { urgency = 'urgent'; urgencyColor = '#f59e0b'; }
        return { ...lease, diffDays, urgency, urgencyColor };
      }).sort((a, b) => a.diffDays - b.diffDays);

      const critical = leasesWithDays.filter(l => l.urgency === 'critical');
      const urgent = leasesWithDays.filter(l => l.urgency === 'urgent');
      const upcoming = leasesWithDays.filter(l => l.urgency === 'upcoming');
      const revenueAtRisk = leasesWithDays.reduce((sum, l) => sum + (l.monthlyRent || 0), 0);

      // --- KPI Panel ---
      let y = doc.y + 5;
      const kpiWidth = 120;
      drawKpiBox(doc, 50, y, kpiWidth, 'EXPIRING LEASES', `${leasesWithDays.length}`, leasesWithDays.length > 0 ? '#f59e0b' : '#22c55e');
      drawKpiBox(doc, 180, y, kpiWidth, 'CRITICAL (≤14d)', `${critical.length}`, critical.length > 0 ? '#ef4444' : '#22c55e');
      drawKpiBox(doc, 310, y, kpiWidth, 'URGENT (15-30d)', `${urgent.length}`, urgent.length > 0 ? '#f59e0b' : '#22c55e');
      drawKpiBox(doc, 440, y, kpiWidth, 'REVENUE AT RISK', `LKR ${revenueAtRisk.toLocaleString()}/mo`, revenueAtRisk > 0 ? '#ef4444' : '#22c55e');
      y += 70;

      if (leasesWithDays.length === 0) {
        y = drawSectionTitle(doc, y, 'Analysis');
        y = drawRecommendation(doc, y, 'No leases are expiring within the next 90 days. Portfolio lease stability is excellent.', 'success');
      } else {
        // --- Expiration Table ---
        y = drawSectionTitle(doc, y, 'Expiring Leases Detail');

        doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b');
        doc.text('Property', 50, y);
        doc.text('Unit', 195, y);
        doc.text('Expiry Date', 255, y);
        doc.text('Days Left', 345, y, { width: 55, align: 'center' });
        doc.text('Monthly Rent', 405, y, { width: 75, align: 'right' });
        doc.text('Urgency', 490, y, { width: 60, align: 'center' });
        doc.moveTo(50, y + 14).lineTo(550, y + 14).strokeColor('#e2e8f0').stroke();
        y += 22;

        doc.font('Helvetica').fontSize(9);
        for (const lease of leasesWithDays) {
          y = checkPageBreak(doc, y, 20);
          const urgencyLabel = lease.urgency === 'critical' ? 'CRITICAL' : lease.urgency === 'urgent' ? 'URGENT' : 'Upcoming';

          doc.fillColor('#334155').text(lease.propertyName || 'N/A', 50, y, { width: 140 });
          doc.text(lease.unitNumber || 'N/A', 195, y);
          doc.text(lease.endDate, 255, y);
          doc.fillColor(lease.urgencyColor).font('Helvetica-Bold').text(`${lease.diffDays}d`, 345, y, { width: 55, align: 'center' });
          doc.fillColor('#334155').font('Helvetica').text(`LKR ${(lease.monthlyRent || 0).toLocaleString()}`, 405, y, { width: 75, align: 'right' });
          doc.fillColor(lease.urgencyColor).font('Helvetica-Bold').text(urgencyLabel, 490, y, { width: 60, align: 'center' });
          doc.font('Helvetica').fillColor('black');
          y += 18;
        }
        y += 10;

        // --- Recommendations ---
        y = checkPageBreak(doc, y, 100);
        y = drawSectionTitle(doc, y, 'Insights & Recommendations');

        if (critical.length > 0) {
          const criticalRent = critical.reduce((s, l) => s + (l.monthlyRent || 0), 0);
          y = drawRecommendation(doc, y, `${critical.length} lease${critical.length > 1 ? 's expire' : ' expires'} within 14 days, representing LKR ${criticalRent.toLocaleString()}/month in revenue. Immediately contact these tenants to negotiate renewals or begin vacancy listing.`, 'critical');
        }
        if (urgent.length > 0) {
          y = checkPageBreak(doc, y, 50);
          y = drawRecommendation(doc, y, `${urgent.length} lease${urgent.length > 1 ? 's expire' : ' expires'} within 15–30 days. Send formal renewal notices and schedule tenant meetings this week.`, 'warning');
        }
        if (upcoming.length > 0 && critical.length === 0 && urgent.length === 0) {
          y = drawRecommendation(doc, y, `${upcoming.length} lease${upcoming.length > 1 ? 's' : ''} expiring in 31–90 days. Begin proactive renewal conversations to ensure continuity and avoid last-minute vacancies.`, 'info');
        }
      }

      doc.end();
    } catch (error) {
      console.error('Error generating lease report:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  }

  // =========================================================================
  //  6. LEAD CONVERSION ANALYTICS REPORT
  // =========================================================================
  async generateLeadConversionReport(req, res) {
    try {
      const stats = await reportService.getLeadConversionStats(req.user);
      const doc = new PDFDocument({ margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=lead_conversion_report.pdf`);
      doc.pipe(res);

      drawReportHeader(doc, 'Lead Conversion Analytics', 'Pipeline performance, conversion efficiency, and lead management insights');
      doc.moveDown(0.5);

      // --- Compute Rates ---
      const convRate = stats.Total > 0 ? ((stats.Converted / stats.Total) * 100).toFixed(1) : '0.0';
      const dropRate = stats.Total > 0 ? ((stats.Dropped / stats.Total) * 100).toFixed(1) : '0.0';
      const activeLeads = stats.Interested || 0;

      // --- KPI Panel ---
      let y = doc.y + 5;
      const kpiWidth = 120;
      drawKpiBox(doc, 50, y, kpiWidth, 'TOTAL LEADS', `${stats.Total}`, '#2563eb');
      drawKpiBox(doc, 180, y, kpiWidth, 'CONVERSION RATE', `${convRate}%`, Number(convRate) >= 30 ? '#22c55e' : Number(convRate) >= 15 ? '#f59e0b' : '#ef4444');
      drawKpiBox(doc, 310, y, kpiWidth, 'DROP-OFF RATE', `${dropRate}%`, Number(dropRate) <= 20 ? '#22c55e' : Number(dropRate) <= 40 ? '#f59e0b' : '#ef4444');
      drawKpiBox(doc, 440, y, kpiWidth, 'ACTIVE PIPELINE', `${activeLeads}`, activeLeads > 0 ? '#2563eb' : '#64748b');
      y += 70;

      // --- Funnel Visualization ---
      y = drawSectionTitle(doc, y, 'Conversion Funnel');

      const funnelSteps = [
        { label: 'Total Leads', count: stats.Total, color: '#94a3b8', rate: null },
        { label: 'Interested (Active Pipeline)', count: stats.Interested, color: '#60a5fa', rate: stats.Total > 0 ? ((stats.Interested / stats.Total) * 100).toFixed(0) : '0' },
        { label: 'Converted to Tenant', count: stats.Converted, color: '#22c55e', rate: stats.Total > 0 ? ((stats.Converted / stats.Total) * 100).toFixed(0) : '0' },
        { label: 'Dropped / Lost', count: stats.Dropped, color: '#ef4444', rate: stats.Total > 0 ? ((stats.Dropped / stats.Total) * 100).toFixed(0) : '0' },
      ];

      const maxWidth = 400;
      funnelSteps.forEach((step, index) => {
        y = checkPageBreak(doc, y, 55);
        const fraction = stats.Total > 0 ? step.count / stats.Total : 0;
        const width = Math.max(80, maxWidth * fraction);
        const x = 50 + (maxWidth - width) / 2;

        doc.save();
        doc.roundedRect(x, y, width, 35, 4).fill(step.color);
        doc.fillColor('white').font('Helvetica-Bold').fontSize(12).text(`${step.count}`, x, y + 4, { width, align: 'center' });
        doc.fillColor('white').font('Helvetica').fontSize(8).text(step.label, x, y + 20, { width, align: 'center' });
        doc.restore();

        // Rate label to the right
        if (step.rate !== null) {
          doc.fillColor('#64748b').font('Helvetica').fontSize(9).text(`${step.rate}% of total`, 50 + maxWidth + 15, y + 12);
        }
        doc.fillColor('black');
        y += 48;
      });
      y += 5;

      // --- Recommendations ---
      y = checkPageBreak(doc, y, 100);
      y = drawSectionTitle(doc, y, 'Insights & Recommendations');

      if (stats.Total === 0) {
        y = drawRecommendation(doc, y, 'No leads have been captured yet. Start marketing your properties and add incoming inquiries as leads to track conversion.', 'warning');
      } else {
        if (Number(convRate) >= 30) {
          y = drawRecommendation(doc, y, `Strong conversion rate at ${convRate}%. Your lead-to-tenant pipeline is performing well. Continue current engagement strategies.`, 'success');
        } else if (Number(convRate) >= 15) {
          y = drawRecommendation(doc, y, `Conversion rate of ${convRate}% is moderate. Review follow-up timing and property presentation. Consider scheduling site visits sooner after initial inquiry.`, 'warning');
        } else {
          y = drawRecommendation(doc, y, `Conversion rate of ${convRate}% is low. Review your lead engagement process — are follow-ups timely? Are leads being qualified properly? Consider improving property listings and response times.`, 'critical');
        }

        if (Number(dropRate) > 40) {
          y = checkPageBreak(doc, y, 50);
          y = drawRecommendation(doc, y, `Drop-off rate is high at ${dropRate}%. Investigate why leads are being lost — common causes include slow follow-up, uncompetitive pricing, or poor first impressions during site visits.`, 'critical');
        }

        if (activeLeads > 0) {
          y = checkPageBreak(doc, y, 50);
          y = drawRecommendation(doc, y, `${activeLeads} lead${activeLeads > 1 ? 's are' : ' is'} currently in the active pipeline. Ensure timely follow-ups to maximize conversions and prevent drop-offs.`, 'info');
        }
      }

      doc.end();
    } catch (error) {
      console.error('Error generating lead report:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  }

  // =========================================================================
  //  LEDGER SUMMARY (JSON endpoint — unchanged)
  // =========================================================================
  /**
   * GET /api/reports/ledger-summary?year=2026
   * Returns JSON (not PDF) with revenue, liability, expense, and net operating income.
   */
  async getLedgerSummary(req, res) {
    try {
      const year = req.query.year || new Date().getFullYear();
      const summary = await reportService.getLedgerSummary(year, req.user);
      res.json(summary);
    } catch (error) {
      console.error('Error fetching ledger summary:', error);
      res.status(500).json({ error: 'Failed to fetch ledger summary' });
    }
  }

  async getMonthlyCashFlow(req, res) {
    try {
      const stats = await reportService.getMonthlyCashFlow(req.user);
      res.json(stats);
    } catch (error) {
      console.error('Error fetching monthly cash flow:', error);
      res.status(500).json({ error: 'Failed to fetch monthly cash flow' });
    }
  }
}

export default new ReportController();
