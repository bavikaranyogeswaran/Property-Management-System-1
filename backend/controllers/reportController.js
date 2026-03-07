
import PDFDocument from 'pdfkit';
import reportService from '../services/reportService.js';

class ReportController {
  //  FINANCIAL REPORT
  async generateFinancialReport(req, res) {
    try {
      const year = req.query.year || new Date().getFullYear();
      const propertyStats = await reportService.getFinancialStats(year, req.user);

      // Create PDF (Presentation Layer)
      const doc = new PDFDocument({ margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename=financial_report_${year}.pdf`
      );

      doc.pipe(res);
      doc.fontSize(20).text(`Financial Performance Report - ${year}`, { align: 'center' });
      doc.moveDown();

      const tableTop = 150;
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text('Property', 50, tableTop);
      doc.text('Income', 250, tableTop);
      doc.text('Expenses', 350, tableTop);
      doc.text('Net Income', 450, tableTop);
      doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

      let y = tableTop + 25;
      let totalIncome = 0;
      let totalExpense = 0;

      doc.font('Helvetica');
      for (const [property, stats] of Object.entries(propertyStats)) {
        const net = stats.income - stats.expense;
        doc.text(property, 50, y);
        doc.text(stats.income.toLocaleString(), 250, y);
        doc.text(stats.expense.toLocaleString(), 350, y);
        doc.text(net.toLocaleString(), 450, y);

        totalIncome += stats.income;
        totalExpense += stats.expense;
        y += 20;
      }

      doc.moveTo(50, y).lineTo(550, y).stroke();
      y += 10;
      doc.font('Helvetica-Bold');
      doc.text('TOTAL', 50, y);
      doc.text(totalIncome.toLocaleString(), 250, y);
      doc.text(totalExpense.toLocaleString(), 350, y);
      doc.text((totalIncome - totalExpense).toLocaleString(), 450, y);

      doc.end();
    } catch (error) {
      console.error('Error generating financial report:', error);
      res.status(500).json({ error: 'Failed to generate financial report' });
    }
  }

  //  OCCUPANCY REPORT
  async generateOccupancyReport(req, res) {
    try {
      const propertyStats = await reportService.getOccupancyStats(req.user);
      const doc = new PDFDocument({ margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=occupancy_report.pdf`);
      doc.pipe(res);

      doc.fontSize(20).text(`Occupancy Report`, { align: 'center' });
      doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
      doc.moveDown();

      let y = 150;
      for (const [property, stats] of Object.entries(propertyStats)) {
        const rate = Math.round((stats.occupied / stats.total) * 100);
        doc.font('Helvetica-Bold').fontSize(14).text(property, 50, y);
        y += 20;
        doc.font('Helvetica').fontSize(12);
        doc.text(`Occupancy Rate: ${rate}% (${stats.occupied}/${stats.total})`, 50, y);
        y += 20;

        if (stats.vacancies.length > 0) {
          doc.fillColor('red').text(`Vacant Units: ${stats.vacancies.join(', ')}`, 50, y);
          doc.fillColor('black');
        } else {
          doc.fillColor('green').text('Fully Occupied', 50, y);
          doc.fillColor('black');
        }
        y += 30;
        if (y > 700) { doc.addPage(); y = 50; }
      }
      doc.end();
    } catch (error) {
      console.error('Error generating occupancy report:', error);
      res.status(500).json({ error: 'Failed to generate occupancy report' });
    }
  }

  //  RISK REPORT
  async generateTenantRiskReport(req, res) {
    try {
      const tenants = await reportService.getTenantRiskStats(req.user);
      const doc = new PDFDocument({ margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=tenant_risk_report.pdf`);
      doc.pipe(res);

      doc.fontSize(20).text(`Tenant Risk Profile`, { align: 'center' });
      doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
      doc.moveDown();

      let y = 150;
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text('Tenant', 50, y);
      doc.text('Behavior Score', 200, y);
      doc.text('Overdue / Paid', 300, y);
      doc.text('Risk Level', 450, y);
      y += 25;
      doc.font('Helvetica');

      for (const tenant of tenants) {
        doc.font('Helvetica').fillColor('black').text(tenant.name, 50, y);
        doc.text(tenant.behavior_score.toString(), 200, y);
        doc.text(`${tenant.overdue_count} / ${tenant.paid_count}`, 300, y);
        doc.fillColor(tenant.color).font('Helvetica-Bold').text(tenant.riskLevel, 450, y);
        doc.font('Helvetica').fillColor('black');
        y += 20;
        if (y > 700) { doc.addPage(); y = 50; }
      }
      doc.end();
    } catch (error) {
      console.error('Error generating tenant risk report:', error);
      res.status(500).json({ error: 'Failed to generate tenant risk report' });
    }
  }

  async generateMaintenanceCategoryReport(req, res) {
    try {
      const { categories, totalCost } = await reportService.getMaintenanceCategoryStats(req.user);
      const doc = new PDFDocument({ margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=maintenance_category_report.pdf`);
      doc.pipe(res);

      doc.fontSize(20).text(`Maintenance Cost Analysis`, { align: 'center' });
      doc.moveDown();

      let y = 150;

      if (totalCost === 0) {
        doc.text('No maintenance costs recorded.', 50, y);
      } else {
        const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);

        for (const [cat, amount] of sorted) {
          const percent = ((amount / totalCost) * 100).toFixed(1);
          doc.text(cat, 50, y);
          doc.text(amount.toLocaleString(), 250, y);
          doc.text(`${percent}%`, 400, y);
          doc.rect(460, y, Number(percent) * 2, 10).fill('blue');
          doc.fillColor('black');
          y += 20;
          if (y > 700) { doc.addPage(); y = 50; }
        }
        doc.text(`Total Maintenance Spend: ${totalCost.toLocaleString()}`, 50, y + 20);
      }
      doc.end();
    } catch (error) {
      console.error('Error generating maintenance report:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  }

  async generateLeaseExpirationReport(req, res) {
    try {
      const expiringLeases = await reportService.getLeaseExpirationStats(req.user);
      const doc = new PDFDocument({ margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=lease_expiration_forecast.pdf`);
      doc.pipe(res);

      doc.fontSize(20).text(`Lease Expiration Forecast (90 Days)`, { align: 'center' });
      doc.moveDown();

      if (expiringLeases.length === 0) {
        doc.text('No leases expiring in the next 90 days.');
      } else {
        const now = new Date();
        let y = 150;
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Property', 50, y);
        doc.text('Unit', 200, y);
        doc.text('Expiration Date', 300, y);
        doc.text('Days Remaining', 450, y);
        y += 25;
        doc.font('Helvetica');

        expiringLeases.forEach((lease) => {
          const endDate = new Date(lease.endDate);
          const diffTime = Math.abs(endDate - now);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          doc.text(lease.propertyName || 'N/A', 50, y);
          doc.text(lease.unitNumber || 'N/A', 200, y);
          doc.text(lease.endDate, 300, y);
          doc.text(`${diffDays} days`, 450, y);
          y += 20;
          if (y > 700) { doc.addPage(); y = 50; }
        });
      }
      doc.end();
    } catch (error) {
      console.error('Error generating lease report:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  }

  async generateLeadConversionReport(req, res) {
    try {
      const stats = await reportService.getLeadConversionStats(req.user);
      const doc = new PDFDocument({ margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=lead_conversion_report.pdf`);
      doc.pipe(res);

      doc.fontSize(20).text(`Lead Conversion Analytics`, { align: 'center' });
      doc.moveDown();

      let y = 150;
      const steps = [
        { label: 'Total Leads', count: stats.Total, color: '#e0e0e0' },
        { label: 'Interested', count: stats.Interested, color: '#b3e5fc' },
        { label: 'Converted', count: stats.Converted, color: '#4caf50' },
        { label: 'Dropped', count: stats.Dropped, color: '#ef5350' },
      ];

      steps.forEach((step, index) => {
        const width = 300 - index * 40;
        const x = (600 - width) / 2;
        doc.rect(x, y, width, 40).fillAndStroke(step.color, 'black');
        doc.fillColor('black').text(`${step.label}: ${step.count}`, x, y + 15, { width, align: 'center' });
        y += 60;
      });

      doc.end();
    } catch (error) {
      console.error('Error generating lead report:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  }

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
}

export default new ReportController();
