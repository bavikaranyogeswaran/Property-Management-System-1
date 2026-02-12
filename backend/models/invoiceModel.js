import pool from '../config/db.js';
import emailService from '../utils/emailService.js';
import userModel from './userModel.js';
import leaseModel from './leaseModel.js';

class InvoiceModel {
  async create(data, connection = null) {
    const { leaseId, amount, dueDate, description, type } = data;
    // Need to determine year/month from dueDate
    const date = new Date(dueDate);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1-12

    const db = connection || pool;
    const [result] = await db.query(
      'INSERT INTO rent_invoices (lease_id, year, month, amount, due_date, status, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [leaseId, year, month, amount, dueDate, 'pending', description]
    );
    const invoiceId = result.insertId;

    // Notify Tenant via Email
    try {
      // Need tenant email. create(data) has leaseId.
      // data might have tenantId? If not, fetch from lease.
      let tenantId = data.tenantId;
      if (!tenantId) {
        const lease = await leaseModel.findById(leaseId);
        tenantId = lease ? lease.tenantId : null;
      }

      if (tenantId) {
        const tenant = await userModel.findById(tenantId);
        if (tenant && tenant.email) {
          await emailService.sendInvoiceNotification(tenant.email, {
            amount,
            dueDate,
            month,
            year,
            invoiceId,
          });
        }
      }
    } catch (emailErr) {
      console.error('Failed to send invoice email:', emailErr);
    }

    return invoiceId;
  }

  async exists(leaseId, year, month, type = null, connection = null) {
    let query =
      'SELECT invoice_id FROM rent_invoices WHERE lease_id = ? AND year = ? AND month = ?';
    const params = [leaseId, year, month];

    // if (type) {
    //     query += ' AND invoice_type = ?';
    //     params.push(type);
    // }

    const db = connection || pool;
    const [rows] = await db.query(query, params);
    return rows.length > 0;
  }

  async getPendingTotal(leaseId) {
    const [rows] = await pool.query(
      'SELECT SUM(amount) as total FROM rent_invoices WHERE lease_id = ? AND status = ?',
      [leaseId, 'pending']
    );
    return rows[0].total || 0;
  }

  async findById(id) {
    // Join with leases to get tenant_id for scoring hooks
    const [rows] = await pool.query(
      `
            SELECT ri.*, l.tenant_id 
            FROM rent_invoices ri 
            JOIN leases l ON ri.lease_id = l.lease_id 
            WHERE ri.invoice_id = ?
        `,
      [id]
    );
    return rows[0];
  }

  async findByTenantId(tenantId) {
    const [rows] = await pool.query(
      `
            SELECT ri.*, l.tenant_id 
            FROM rent_invoices ri
            JOIN leases l ON ri.lease_id = l.lease_id
            WHERE l.tenant_id = ? 
            ORDER BY ri.due_date ASC
        `,
      [tenantId]
    );
    return rows;
  }

  async findAll() {
    const [rows] = await pool.query(`
            SELECT ri.*, l.tenant_id, l.unit_id, u.name as tenant_name, p.name as property_name, un.unit_number
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
    const [rows] = await pool.query(
      `
            SELECT ri.*, l.tenant_id, l.unit_id, u.name as tenant_name, p.name as property_name, un.unit_number
            FROM rent_invoices ri
            JOIN leases l ON ri.lease_id = l.lease_id
            JOIN users u ON l.tenant_id = u.user_id
            JOIN units un ON l.unit_id = un.unit_id
            JOIN properties p ON un.property_id = p.property_id
            JOIN staff_property_assignments spa ON p.property_id = spa.property_id
            WHERE spa.user_id = ?
            ORDER BY ri.due_date DESC
        `,
      [treasurerId]
    );
    return rows;
  }

  async updateStatus(id, status) {
    await pool.query(
      'UPDATE rent_invoices SET status = ? WHERE invoice_id = ?',
      [status, id]
    );
    return this.findById(id);
  }

  async createLateFeeInvoice(data) {
    const { leaseId, amount, dueDate, description } = data;
    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    // Ensure we don't double charge for same month/year?
    // Or should we link it to the original invoice?
    // For now, standalone 'Late Fee' invoice.
    const [result] = await pool.query(
      'INSERT INTO rent_invoices (lease_id, year, month, amount, due_date, status, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [leaseId, year, month, amount, dueDate, 'pending', description]
    );
    return result.insertId;
  }

  async findOverdue(gracePeriodDays = 5) {
    // Find Pending invoices where due_date < (today - gracePeriodDays)
    // AND description NOT LIKE 'Late Fee%' (to avoid compounding late fees on late fees?)
    // Fix 1: Use Invoice Amount, not Lease Rent (Handles rent changes correctly)
    // const [rows] = await pool.query(`SELECT ri.*, l.monthly_rent...`) -> ri.amount is what we want.
    const [rows] = await pool.query(
      `
            SELECT ri.*, l.tenant_id
            FROM rent_invoices ri
            JOIN leases l ON ri.lease_id = l.lease_id
            WHERE ri.status IN ('pending', 'partially_paid')
            AND ri.due_date < DATE_SUB(CURDATE(), INTERVAL ? DAY)
            AND NOT EXISTS (
                SELECT 1 FROM rent_invoices ri2 
                WHERE ri2.lease_id = ri.lease_id 
                AND ri2.description LIKE CONCAT('%Invoice #', ri.invoice_id, '%')
            )
        `,
      [gracePeriodDays]
    );
    return rows;
  }

  async findByLeaseAndDescription(leaseId, description) {
    const [rows] = await pool.query(
      'SELECT * FROM rent_invoices WHERE lease_id = ? AND description LIKE ?',
      [leaseId, `%${description}%`]
    );
    return rows;
  }
}

export default new InvoiceModel();
