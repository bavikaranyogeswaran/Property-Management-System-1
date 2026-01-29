import pool from '../config/db.js';

class InvoiceModel {
    async create(data) {
        const { leaseId, amount, dueDate, description } = data;
        // Need to determine year/month from dueDate
        const date = new Date(dueDate);
        const year = date.getFullYear();
        const month = date.getMonth() + 1; // 1-12

        const [result] = await pool.query(
            'INSERT INTO rent_invoices (lease_id, year, month, amount, due_date, status) VALUES (?, ?, ?, ?, ?, ?)',
            [leaseId, year, month, amount, dueDate, 'pending']
        );
        return result.insertId;
    }

    async findById(id) {
        // Join with leases to get tenant_id for scoring hooks
        const [rows] = await pool.query(`
            SELECT ri.*, l.tenant_id 
            FROM rent_invoices ri 
            JOIN leases l ON ri.lease_id = l.lease_id 
            WHERE ri.invoice_id = ?
        `, [id]);
        return rows[0];
    }

    async findByTenantId(tenantId) {
        const [rows] = await pool.query(`
            SELECT ri.* 
            FROM rent_invoices ri
            JOIN leases l ON ri.lease_id = l.lease_id
            WHERE l.tenant_id = ? 
            ORDER BY ri.due_date ASC
        `, [tenantId]);
        return rows;
    }

    async findAll() {
        const [rows] = await pool.query(`
            SELECT ri.*, u.first_name, u.last_name, p.name as property_name
            FROM rent_invoices ri
            JOIN users u ON ri.tenant_id = u.user_id
            JOIN properties p ON ri.property_id = p.property_id
            ORDER BY ri.due_date DESC
        `);
        return rows;
    }

    async updateStatus(id, status) {
        await pool.query('UPDATE rent_invoices SET status = ? WHERE invoice_id = ?', [status, id]);
        return this.findById(id);
    }

    // Check for existing invoice for valid period to prevent duplicates?
    // Leaving simple for now.
}

export default new InvoiceModel();
