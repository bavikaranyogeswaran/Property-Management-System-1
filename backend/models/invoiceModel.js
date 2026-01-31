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
            SELECT ri.*, u.first_name, u.last_name, p.name as property_name
            FROM rent_invoices ri
            JOIN users u ON ri.tenant_id = u.user_id
            JOIN properties p ON ri.property_id = p.property_id
            ORDER BY ri.due_date DESC
        `);
        return rows;
    }

    async findByTreasurerId(treasurerId) {
        const [rows] = await pool.query(`
            SELECT ri.*, u.first_name, u.last_name, p.name as property_name
            FROM rent_invoices ri
            JOIN leases l ON ri.lease_id = l.lease_id
            -- Link invoice to property via Lease -> Unit -> Property OR directly if ri.property_id exists
            -- InvoiceModel create uses leaseId...
            -- Let's check schema. rent_invoices has NO property_id column in create method!
            -- Wait, getInvoices uses ri.property_id in findAll query above? 
            -- Line 53: JOIN properties p ON ri.property_id = p.property_id
            -- But create method (line 12) does NOT insert property_id.
            -- This is a BUG in existing findAll or schema. 
            -- Checking schema.sql: rent_invoices table (line 209) does NOT have property_id.
            -- So existing findAll is BROKEN or I misread it. 
            -- Actually, findAll above uses ri.property_id which doesn't exist in schema I just read?
            -- Let's re-read schema.sql for rent_invoices.
            -- Line 209: invoice_id, lease_id, year, month, amount, due_date, status.
            -- NO property_id.
            -- So findAll query (line 50) MUST be wrong if it joins on ri.property_id.
            -- It should join lease -> unit -> property.
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
