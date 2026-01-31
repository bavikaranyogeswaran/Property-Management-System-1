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

    async exists(leaseId, year, month) {
        const [rows] = await pool.query(
            'SELECT invoice_id FROM rent_invoices WHERE lease_id = ? AND year = ? AND month = ?',
            [leaseId, year, month]
        );
        return rows.length > 0;
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
            SELECT ri.*, l.tenant_id, l.unit_id, u.name as tenant_name, p.name as property_name
            FROM rent_invoices ri
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN users u ON l.tenant_id = u.user_id
            JOIN units un ON l.unit_id = un.unit_id
            JOIN properties p ON un.property_id = p.property_id
            ORDER BY ri.due_date DESC
        `);
        return rows;
    }

    async findByTreasurerId(treasurerId) {
        const [rows] = await pool.query(`
            SELECT ri.*, l.tenant_id, l.unit_id, u.name as tenant_name, p.name as property_name
            FROM rent_invoices ri
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN users u ON l.tenant_id = u.user_id
            JOIN units un ON l.unit_id = un.unit_id
            JOIN properties p ON un.property_id = p.property_id
            JOIN staff_property_assignments spa ON p.property_id = spa.property_id
            WHERE spa.user_id = ?
            ORDER BY ri.due_date DESC
        `, [treasurerId]);
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
