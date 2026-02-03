import pool from '../config/db.js';

class PayoutModel {
    async create(data) {
        const { ownerId, amount, periodStart, periodEnd } = data;
        const [result] = await pool.query(
            'INSERT INTO owner_payouts (owner_id, amount, period_start, period_end) VALUES (?, ?, ?, ?)',
            [ownerId, amount, periodStart, periodEnd]
        );
        return result.insertId;
    }

    async findByOwnerId(ownerId) {
        const [rows] = await pool.query('SELECT * FROM owner_payouts WHERE owner_id = ? ORDER BY generated_at DESC', [ownerId]);
        return rows;
    }

    async markAsProcessed(payoutId) {
        await pool.query('UPDATE owner_payouts SET status = "processed", processed_at = NOW() WHERE payout_id = ?', [payoutId]);
        return true;
    }

    // Core Logic: Rent - Expenses
    async calculateNetPayout(ownerId, startDate, endDate) {
        // 1. Total Verified Payments (Income)
        // Join: Payments -> Invoices -> Leases -> Units -> Properties
        const [incomeRows] = await pool.query(`
            SELECT COALESCE(SUM(p.amount), 0) as total_income
            FROM payments p
            JOIN rent_invoices ri ON p.invoice_id = ri.invoice_id
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties prop ON u.property_id = prop.property_id
            WHERE prop.owner_id = ? 
            AND p.status = 'verified'
            AND p.payment_date BETWEEN ? AND ?
        `, [ownerId, startDate, endDate]);

        const totalIncome = parseFloat(incomeRows[0].total_income);

        // 2. Total Maintenance Costs (Expenses)
        // Join: MaintCosts -> MaintRequests -> Units -> Properties
        const [expenseRows] = await pool.query(`
            SELECT COALESCE(SUM(mc.amount), 0) as total_expenses
            FROM maintenance_costs mc
            JOIN maintenance_requests mr ON mc.request_id = mr.request_id
            JOIN units u ON mr.unit_id = u.unit_id
            JOIN properties prop ON u.property_id = prop.property_id
            WHERE prop.owner_id = ?
            AND mc.recorded_date BETWEEN ? AND ?
        `, [ownerId, startDate, endDate]);

        const totalExpenses = parseFloat(expenseRows[0].total_expenses);

        return {
            totalIncome,
            totalExpenses,
            netPayout: totalIncome - totalExpenses
        };
    }
}

export default new PayoutModel();
