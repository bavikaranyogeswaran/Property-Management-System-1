import PDFDocument from 'pdfkit';
import logger from './logger.js';

/**
 * ReportGenerator - Specialized utility for standardized PMS reports.
 * Encapsulates PDF formatting, layout patterns, and rendering logic.
 */
class ReportGenerator {
  constructor(res, filename, title, subtitle) {
    this.res = res;
    this.doc = new PDFDocument({ margin: 50 });
    this.y = 50; // Initial cursor position

    // Standard headers for PDF downloads
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=${filename}`);
    this.doc.pipe(res);

    this.title = title;
    this.subtitle = subtitle;
  }

  /** Initialize the report with a header and timestamp */
  generateHeader() {
    this.doc
      .fontSize(22)
      .font('Helvetica-Bold')
      .fillColor('#1e293b')
      .text(this.title, { align: 'center' });
    this.doc.moveDown(0.2);
    this.doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#64748b')
      .text(this.subtitle, { align: 'center' });
    this.doc
      .fontSize(9)
      .text(
        `Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
        { align: 'center' }
      );
    this.doc.fillColor('black').font('Helvetica').fontSize(10);
    this.y = this.doc.y + 15;
    return this;
  }

  /** Check for page overflow and add a new page if needed */
  checkPageBreak(needed = 60) {
    if (this.y + needed > 720) {
      this.doc.addPage();
      this.y = 50;
    }
    return this;
  }

  /** Draw a section title with a colored visual marker */
  drawSectionTitle(title) {
    this.checkPageBreak(40);
    this.doc.save();
    this.doc.rect(50, this.y, 4, 18).fill('#2563eb');
    this.doc
      .fillColor('#1e293b')
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(title, 62, this.y + 1);
    this.doc.restore();
    this.doc.fillColor('black').font('Helvetica').fontSize(10);
    this.y += 28;
    return this;
  }

  /** Draw a standardized KPI Panel (4 boxes across) */
  drawKpiPanel(kpis) {
    this.checkPageBreak(80);
    const kpiWidth = 120;
    const spacing = 6;
    let currentX = 50;

    kpis.forEach((kpi) => {
      this.renderKpiBox(
        currentX,
        this.y,
        kpiWidth,
        kpi.label,
        kpi.value,
        kpi.color
      );
      currentX += kpiWidth + spacing;
    });

    this.y += 70;
    return this;
  }

  /** Internal helper for KPI boxes */
  renderKpiBox(x, y, width, label, value, color = '#2563eb') {
    this.doc.save();
    this.doc.roundedRect(x, y, width, 55, 6).fill(color);

    let fontSize = 16;
    if (value.length > 16) fontSize = 12;
    else if (value.length > 13) fontSize = 14;

    this.doc
      .fillColor('white')
      .font('Helvetica-Bold')
      .fontSize(fontSize)
      .text(value, x, y + 10, { width, align: 'center' });
    this.doc
      .fillColor('white')
      .font('Helvetica')
      .fontSize(8.5)
      .text(label, x, y + 34, { width, align: 'center' });
    this.doc.restore();
    this.doc.fillColor('black').font('Helvetica');
  }

  /** Draw an insight/recommendation box with specialized icons and colors */
  drawInsights(insights) {
    if (!insights || insights.length === 0) return this;

    this.drawSectionTitle('Insights & Recommendations');

    insights.forEach((insight) => {
      this.checkPageBreak(55);
      const intensity = insight.urgency || 'info';
      const color = {
        info: '#2563eb',
        warning: '#f59e0b',
        critical: '#ef4444',
        success: '#22c55e',
      }[intensity];
      const bgColor = {
        info: '#eff6ff',
        warning: '#fffbeb',
        critical: '#fef2f2',
        success: '#f0fdf4',
      }[intensity];
      const icon = { info: 'ℹ', warning: '⚠', critical: '⚠', success: '✓' }[
        intensity
      ];

      this.doc.save();
      this.doc.roundedRect(50, this.y, 500, 40, 4).fill(bgColor);
      this.doc.roundedRect(50, this.y, 4, 40, 0).fill(color);
      this.doc
        .fillColor(color)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(icon, 62, this.y + 12);
      this.doc
        .fillColor('#334155')
        .font('Helvetica')
        .fontSize(9)
        .text(insight.message, 76, this.y + 8, { width: 460, lineGap: 3 });
      this.doc.restore();
      this.y += 50;
    });

    return this;
  }

  /** End the PDF stream */
  finalize() {
    this.doc.end();
  }
}

export default ReportGenerator;
