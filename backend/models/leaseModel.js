import db from '../config/db.js';

class LeaseModel {
    async create(data, connection = null) {
        const { tenantId, unitId, startDate, endDate, monthlyRent, status, securityDeposit, depositStatus } = data;
        const dbConn = connection || db;
        const [result] = await dbConn.query(
            `INSERT INTO leases (tenant_id, unit_id, start_date, end_date, monthly_rent, status, security_deposit, deposit_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [tenantId, unitId, startDate, endDate, monthlyRent, status || 'active', securityDeposit || 0.00, depositStatus || 'pending']
        );
        return result.insertId;
    }

    async findAll() {
        const [rows] = await db.query(`
            SELECT l.*, 
                   u.unit_number,
                   p.name as property_name
            FROM leases l
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id
            ORDER BY l.created_at DESC
        `);
        return this.mapRows(rows);
    }

    async findById(id) {
        const [rows] = await db.query(`
            SELECT l.*, 
                   u.unit_number,
                   p.name as property_name
            FROM leases l
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id
            WHERE l.lease_id = ?
        `, [id]);
        if (rows.length === 0) return null;
        return this.mapRows(rows)[0];
    }

    async findByTenantId(tenantId) {
        const [rows] = await db.query(`
            SELECT l.*, 
                   u.unit_number,
                   p.name as property_name
            FROM leases l
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id
            WHERE l.tenant_id = ?
        `, [tenantId]);
        return this.mapRows(rows);
    }

    async findActive() {
        const [rows] = await db.query(`
            SELECT l.*, 
                   u.unit_number,
                   p.name as property_name
            FROM leases l
            JOIN units u ON l.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id
            WHERE l.status = 'active'
        `);
        return this.mapRows(rows);
    }

    async checkOverlap(unitId, startDate, endDate) {
        const [rows] = await db.query(`
            SELECT lease_id FROM leases 
            WHERE unit_id = ? 
            AND status IN ('active', 'pending')
            AND start_date <= ? 
            AND end_date >= ?
        `, [unitId, endDate, startDate]);
        return rows.length > 0;
    }

    mapRows(rows) {
        return rows.map(row => ({
            id: row.lease_id.toString(),
            tenantId: row.tenant_id.toString(),
            unitId: row.unit_id.toString(),
            startDate: this.formatDate(row.start_date),
            endDate: this.formatDate(row.end_date),
            monthlyRent: parseFloat(row.monthly_rent),
            status: row.status,
            securityDeposit: parseFloat(row.security_deposit || 0),
            depositStatus: row.deposit_status,
            createdAt: row.created_at,
            // Extra info useful for frontend listing
            unitNumber: row.unit_number,
            propertyName: row.property_name
        }));
    }

    formatDate(date) {
        if (!date) return null;
        return new Date(date).toISOString().split('T')[0];
    }
}

export default new LeaseModel();
