import pool from '../config/db.js';

class InvoiceModel {
    async create(data) {
        const { leaseId, tenantId, propertyId, amount, dueDate, description } = data;
        const [result] = await pool.query(
            'INSERT INTO rent_invoices (lease_id, tenant_id, property_id, amount, due_date, description, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [leaseId, tenantId, propertyId, amount, dueDate, description, 'pending']
        );
        return result.insertId;
    }

    async findById(id) {
        const [rows] = await pool.query('SELECT * FROM rent_invoices WHERE invoice_id = ?', [id]);
        return rows[0];
    }

    async findByTenantId(tenantId) {
        const [rows] = await pool.query('SELECT * FROM rent_invoices WHERE tenant_id = ? ORDER BY due_date ASC', [tenantId]);
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
