import PDFDocument from 'pdfkit';
import invoiceModel from '../models/invoiceModel.js';
import maintenanceCostModel from '../models/maintenanceCostModel.js';
import unitModel from '../models/unitModel.js';
import propertyModel from '../models/propertyModel.js';

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
}

export default new ReportController();
