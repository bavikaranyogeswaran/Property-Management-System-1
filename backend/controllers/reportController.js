import PDFDocument from 'pdfkit';
import invoiceModel from '../models/invoiceModel.js';
import maintenanceCostModel from '../models/maintenanceCostModel.js';
import unitModel from '../models/unitModel.js';
import propertyModel from '../models/propertyModel.js';
import leaseModel from '../models/leaseModel.js';
import leadModel from '../models/leadModel.js';

class ReportController {
    async generateFinancialReport(req, res) {
        try {
            const year = req.query.year || new Date().getFullYear();

            // Fetch Data
            const invoices = await invoiceModel.findAll();
            const costs = await maintenanceCostModel.findAllWithDetails();

            // Filter for the requested year & Paid status
            const paidInvoices = invoices.filter(i =>
                i.status === 'paid' &&
                new Date(i.due_date).getFullYear() == year
            );

            const yearCosts = costs.filter(c =>
                new Date(c.recorded_date).getFullYear() == year
            );

            // Group by Property
            const propertyStats = {};

            paidInvoices.forEach(inv => {
                const name = inv.property_name || 'Unknown Property';
                if (!propertyStats[name]) propertyStats[name] = { income: 0, expense: 0 };
                propertyStats[name].income += Number(inv.amount);
            });

            yearCosts.forEach(cost => {
                const name = cost.property_name || 'Unknown Property';
                if (!propertyStats[name]) propertyStats[name] = { income: 0, expense: 0 };
                propertyStats[name].expense += Number(cost.amount);
            });

            // Create PDF
            const doc = new PDFDocument({ margin: 50 });

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=financial_report_${year}.pdf`);

            doc.pipe(res);

            // Title
            doc.fontSize(20).text(`Financial Performance Report - ${year}`, { align: 'center' });
            doc.moveDown();

            // Summary Table Header
            const tableTop = 150;
            const itemX = 50;
            const incomeX = 250;
            const expenseX = 350;
            const netX = 450;

            doc.fontSize(12).font('Helvetica-Bold');
            doc.text('Property', itemX, tableTop);
            doc.text('Income', incomeX, tableTop);
            doc.text('Expenses', expenseX, tableTop);
            doc.text('Net Income', netX, tableTop);

            doc.moveTo(itemX, tableTop + 15).lineTo(550, tableTop + 15).stroke();

            // Rows
            let y = tableTop + 25;
            let totalIncome = 0;
            let totalExpense = 0;

            doc.font('Helvetica');
            for (const [property, stats] of Object.entries(propertyStats)) {
                const net = stats.income - stats.expense;

                doc.text(property, itemX, y);
                doc.text(stats.income.toLocaleString(), incomeX, y);
                doc.text(stats.expense.toLocaleString(), expenseX, y);
                doc.text(net.toLocaleString(), netX, y); // Could color code red if negative?

                totalIncome += stats.income;
                totalExpense += stats.expense;
                y += 20;
            }

            doc.moveTo(itemX, y).lineTo(550, y).stroke();
            y += 10;

            // Grand Total
            doc.font('Helvetica-Bold');
            doc.text('TOTAL', itemX, y);
            doc.text(totalIncome.toLocaleString(), incomeX, y);
            doc.text(totalExpense.toLocaleString(), expenseX, y);
            doc.text((totalIncome - totalExpense).toLocaleString(), netX, y);

            doc.end();

        } catch (error) {
            console.error('Error generating financial report:', error);
            res.status(500).json({ error: 'Failed to generate financial report' });
        }
    }

    async generateOccupancyReport(req, res) {
        try {
            // Fetch Units
            const units = await unitModel.findAll();

            // Group by Property
            const propertyStats = {};

            // We need property names for units. unitModel.findAll() usually joins property.
            // Let's assume unitModel.findAll() returns rows with property_name or we fetch properties separately.
            // Checking unitModel later, but let's be safe and fetch properties too or map them.
            // unitController often uses findAll and it joins. logic check: yes likely.

            // Actually, let's fetch properties to map IDs if needed, but unitModel.findAll usually has it.
            // Let's try to rely on what unitModel returns. 
            // If unitModel doesn't have property_name, we might group by ID and map later.

            // Let's assume it has it or we group by propertyId.
            for (const unit of units) {
                // If unit has property_name, use it. Else use ID.
                // NOTE: We need property names for the report.
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

            const doc = new PDFDocument({ margin: 50 });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=occupancy_report.pdf`);
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

                y += 30; // Spacing between properties

                if (y > 700) { // New page if near bottom
                    doc.addPage();
                    y = 50;
                }
            }

            doc.end();

        } catch (error) {
            console.error('Error generating occupancy report:', error);
            res.status(500).json({ error: 'Failed to generate occupancy report' });
        }
    }

    async generateTenantRiskReport(req, res) {
        try {
            // Fetch Tenants with profile data
            // We need: name, behavior_score, and payment history (late fees or overdue invoices)
            // userModel.findAllTenants() might be needed or we use invoiceModel/behaviorModel

            // Let's rely on invoiceModel.findAll() which joins users, and we can aggregate.
            // But we also need behavior scores which are on the user table (tenant role).

            // Quickest way: Fetch all invoices to check payment history + Fetch all tenants for scores.

            // 1. Fetch Tenants (users with role 'tenant')
            // We assume userModel has a way to find by role or we use raw query here for speed/custom join
            // Let's perform a custom query to get everything we need for the report.

            const [tenants] = await invoiceModel.pool.query(`
                SELECT u.user_id, u.name, u.email, t.behavior_score,
                       (SELECT COUNT(*) FROM rent_invoices ri 
                        JOIN leases l ON ri.lease_id = l.lease_id 
                        WHERE l.tenant_id = u.user_id AND ri.status = 'overdue') as overdue_count,
                       (SELECT COUNT(*) FROM rent_invoices ri 
                        JOIN leases l ON ri.lease_id = l.lease_id 
                        WHERE l.tenant_id = u.user_id AND ri.status = 'paid') as paid_count
                FROM users u
                JOIN tenants t ON u.user_id = t.user_id
                WHERE u.role = 'tenant'
                ORDER BY t.behavior_score ASC
            `);

            const doc = new PDFDocument({ margin: 50 });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=tenant_risk_report.pdf`);
            doc.pipe(res);

            doc.fontSize(20).text(`Tenant Risk Profile`, { align: 'center' });
            doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
            doc.moveDown();

            // Table Header
            const tableTop = 150;
            const nameX = 50;
            const scoreX = 200;
            const historyX = 300;
            const riskX = 450;

            doc.fontSize(12).font('Helvetica-Bold');
            doc.text('Tenant', nameX, tableTop);
            doc.text('Behavior Score', scoreX, tableTop);
            doc.text('Overdue / Paid', historyX, tableTop);
            doc.text('Risk Level', riskX, tableTop);

            doc.moveTo(nameX, tableTop + 15).lineTo(550, tableTop + 15).stroke();

            let y = tableTop + 25;

            doc.font('Helvetica');
            for (const tenant of tenants) {
                // Risk Calculation Logic
                // Start with score (Base 100). < 80 is watching, < 50 is bad.
                // Overdue invoices add significant risk.

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

                doc.fillColor('black').text(tenant.name, nameX, y);
                doc.text(tenant.behavior_score.toString(), scoreX, y);
                doc.text(`${tenant.overdue_count} / ${tenant.paid_count}`, historyX, y);

                doc.fillColor(color).font('Helvetica-Bold').text(riskLevel, riskX, y);

                y += 20;

                if (y > 700) {
                    doc.addPage();
                    y = 50;
                    // Redraw header
                    doc.fillColor('black').fontSize(12).font('Helvetica-Bold');
                    doc.text('Tenant', nameX, y);
                    doc.text('Behavior Score', scoreX, y);
                    doc.text('Overdue / Paid', historyX, y);
                    doc.text('Risk Level', riskX, y);
                    doc.moveTo(nameX, y + 15).lineTo(550, y + 15).stroke();
                    y += 25;
                    doc.font('Helvetica');
                }
            }
            doc.end();

        } catch (error) {
            console.error('Error generating tenant risk report:', error);
            res.status(500).json({ error: 'Failed to generate tenant risk report' });
        }
    }
    async generateMaintenanceCategoryReport(req, res) {
        try {
            const costs = await maintenanceCostModel.findAllWithDetails();

            // Group by Category (inferred from title/description)
            const categories = {};
            let totalCost = 0;

            costs.forEach(cost => {
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

            const doc = new PDFDocument({ margin: 50 });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=maintenance_category_report.pdf`);
            doc.pipe(res);

            doc.fontSize(20).text(`Maintenance Cost Analysis`, { align: 'center' });
            doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
            doc.moveDown();

            const tableTop = 150;
            const catX = 50;
            const amountX = 250;
            const percentX = 400;

            doc.fontSize(12).font('Helvetica-Bold');
            doc.text('Category', catX, tableTop);
            doc.text('Total Cost', amountX, tableTop);
            doc.text('% of Total', percentX, tableTop);

            doc.moveTo(catX, tableTop + 15).lineTo(550, tableTop + 15).stroke();

            let y = tableTop + 25;
            doc.font('Helvetica');

            // Sort by cost desc
            const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);

            for (const [cat, amount] of sorted) {
                const percent = ((amount / totalCost) * 100).toFixed(1);

                doc.text(cat, catX, y);
                doc.text(amount.toLocaleString(), amountX, y);
                doc.text(`${percent}%`, percentX, y);

                // Simple bar chart
                doc.rect(percentX + 60, y, Number(percent) * 2, 10).fill('blue');
                doc.fillColor('black');

                y += 20;
            }

            doc.moveDown();
            doc.font('Helvetica-Bold').text(`Total Maintenance Spend: ${totalCost.toLocaleString()}`, catX, y + 20);

            doc.end();

        } catch (error) {
            console.error('Error generating maintenance report:', error);
            res.status(500).json({ error: 'Failed to generate report' });
        }
    }

    async generateLeaseExpirationReport(req, res) {
        try {
            const activeLeases = await leaseModel.findActive();
            // Assuming tenant name and property name are joined in findActive()

            const now = new Date();
            const ninetyDaysFromNow = new Date();
            ninetyDaysFromNow.setDate(now.getDate() + 90);

            const expiringLeases = activeLeases.filter(lease => {
                const endDate = new Date(lease.endDate); // leaseModel formats this
                return endDate >= now && endDate <= ninetyDaysFromNow;
            });

            const doc = new PDFDocument({ margin: 50 });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=lease_expiration_forecast.pdf`);
            doc.pipe(res);

            doc.fontSize(20).text(`Lease Expiration Forecast (90 Days)`, { align: 'center' });
            doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
            doc.moveDown();

            if (expiringLeases.length === 0) {
                doc.text('No leases expiring in the next 90 days.');
            } else {
                const tableTop = 150;
                doc.fontSize(10).font('Helvetica-Bold');
                doc.text('Property', 50, tableTop);
                doc.text('Unit', 200, tableTop);
                doc.text('Expiration Date', 300, tableTop);
                doc.text('Days Remaining', 450, tableTop);

                doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

                let y = tableTop + 25;
                doc.font('Helvetica');

                expiringLeases.forEach(lease => {
                    const endDate = new Date(lease.endDate);
                    const diffTime = Math.abs(endDate - now);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    doc.text(lease.propertyName || 'N/A', 50, y);
                    doc.text(lease.unitNumber || 'N/A', 200, y);
                    doc.text(lease.endDate, 300, y);
                    doc.text(`${diffDays} days`, 450, y);

                    y += 20;
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
            const leads = await leadModel.findAll();

            const stats = {
                Total: leads.length,
                Interested: 0,
                Scheduled: 0,
                visited: 0, // Assuming status update
                Application: 0,
                Leased: 0
            };

            // Map status to funnel step
            leads.forEach(lead => {
                const status = lead.status.toLowerCase();
                if (status === 'interested' || status === 'new') stats.Interested++;
                if (status.includes('schedule') || status.includes('visit')) stats.Scheduled++;
                if (status.includes('application') || status === 'applied') stats.Application++;
                if (status === 'converted' || status === 'leased' || status === 'tenant') stats.Leased++;
            });

            const doc = new PDFDocument({ margin: 50 });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=lead_conversion_report.pdf`);
            doc.pipe(res);

            doc.fontSize(20).text(`Lead Conversion Analytics`, { align: 'center' });
            doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
            doc.moveDown();

            // Funnel Visualization
            let y = 150;
            const steps = [
                { label: 'Total Leads', count: stats.Total, color: '#e0e0e0' },
                { label: 'Visits Scheduled', count: stats.Scheduled, color: '#b3e5fc' },
                { label: 'Applications', count: stats.Application, color: '#81c784' },
                { label: 'Signed Leases', count: stats.Leased, color: '#4caf50' }
            ];

            doc.font('Helvetica-Bold');
            steps.forEach((step, index) => {
                const width = 300 - (index * 40); // Funnel shape
                const x = (600 - width) / 2;

                doc.rect(x, y, width, 40).fillAndStroke(step.color, 'black');
                doc.fillColor('black').text(`${step.label}: ${step.count}`, x, y + 15, { width: width, align: 'center' });

                // Conversion Rate
                if (index > 0) {
                    const prev = steps[index - 1];
                    const rate = prev.count > 0 ? ((step.count / prev.count) * 100).toFixed(1) : 0;
                    doc.fontSize(10).text(`${rate}% conversion`, x + width + 10, y + 15);
                    doc.fontSize(12);
                }

                y += 60;
            });

            doc.end();

        } catch (error) {
            console.error('Error generating lead report:', error);
            res.status(500).json({ error: 'Failed to generate report' });
        }
    }
}

export default new ReportController();
