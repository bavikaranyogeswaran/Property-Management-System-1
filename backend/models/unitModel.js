// ============================================================================
//  UNIT MODEL (The Room Details)
// ============================================================================
//  This file manages the specific details of each room or apartment.
//  It knows the Unit Number (e.g., "A101"), the Rent Price, and the Type.
// ============================================================================

import db from '../config/db.js';

class UnitModel {
  //  CREATE UNIT: Adding a new room to the system.
  async create(data) {
    // data: propertyId, unitNumber, unitTypeId, monthlyRent, status, imageUrl
    const {
      propertyId,
      unitNumber,
      unitTypeId,
      monthlyRent,
      status,
      imageUrl,
    } = data;
    const [result] = await db.query(
      `INSERT INTO units (property_id, unit_number, unit_type_id, monthly_rent, status, image_url)
             VALUES (?, ?, ?, ?, ?, ?)`,
      [
        propertyId,
        unitNumber,
        unitTypeId,
        monthlyRent,
        status || 'available',
        imageUrl || null,
      ]
    );
    return result.insertId;
  }

  async findAll() {
    const [rows] = await db.query(`
            SELECT u.*, 
                   p.name as property_name, 
                   ut.name as type_name,
                   (SELECT COUNT(*) FROM leases l 
                    WHERE l.unit_id = u.unit_id 
                    AND l.status = 'active' 
                    AND l.start_date <= CURRENT_DATE() 
                    AND (l.end_date IS NULL OR l.end_date >= CURRENT_DATE())) as active_lease_count,
                   (SELECT COUNT(*) FROM leases l 
                    WHERE l.unit_id = u.unit_id 
                    AND l.status IN ('active', 'pending')
                    AND l.start_date > CURRENT_DATE() 
                    AND l.deleted_at IS NULL) as future_lease_count
            FROM units u
            JOIN properties p ON u.property_id = p.property_id
            JOIN unit_types ut ON u.unit_type_id = ut.type_id
            WHERE u.is_archived = FALSE
            ORDER BY u.created_at DESC
        `);
    return this.mapRows(rows);
  }

  async findById(id, connection = null) {
    const dbConn = connection || db;
    const [rows] = await dbConn.query(
      `
            SELECT u.*, 
                   p.name as property_name, 
                   ut.name as type_name,
                   (SELECT COUNT(*) FROM leases l 
                    WHERE l.unit_id = u.unit_id 
                    AND l.status = 'active' 
                    AND l.start_date <= CURRENT_DATE() 
                    AND (l.end_date IS NULL OR l.end_date >= CURRENT_DATE())) as active_lease_count,
                   (SELECT COUNT(*) FROM leases l 
                    WHERE l.unit_id = u.unit_id 
                    AND l.status IN ('active', 'pending')
                    AND l.start_date > CURRENT_DATE() 
                    AND l.deleted_at IS NULL) as future_lease_count
            FROM units u
            JOIN properties p ON u.property_id = p.property_id
            JOIN unit_types ut ON u.unit_type_id = ut.type_id
            WHERE u.unit_id = ? AND u.is_archived = FALSE
        `,
      [id]
    );
    if (rows.length === 0) return null;
    return this.mapRows(rows)[0];
  }

  async findByIdForUpdate(id, connection) {
    // Must use the transaction connection
    const [rows] = await connection.query(
      `
            SELECT u.*, 
                   p.name as property_name, 
                   ut.name as type_name,
                   (SELECT COUNT(*) FROM leases l 
                    WHERE l.unit_id = u.unit_id 
                    AND l.status = 'active' 
                    AND l.start_date <= CURRENT_DATE() 
                    AND (l.end_date IS NULL OR l.end_date >= CURRENT_DATE())) as active_lease_count,
                   (SELECT COUNT(*) FROM leases l 
                    WHERE l.unit_id = u.unit_id 
                    AND l.status IN ('active', 'pending')
                    AND l.start_date > CURRENT_DATE() 
                    AND l.deleted_at IS NULL) as future_lease_count
            FROM units u
            JOIN properties p ON u.property_id = p.property_id
            JOIN unit_types ut ON u.unit_type_id = ut.type_id
            WHERE u.unit_id = ? AND u.is_archived = FALSE
            FOR UPDATE
        `,
      [id]
    );
    if (rows.length === 0) return null;
    return this.mapRows(rows)[0];
  }

  async findByPropertyId(propertyId) {
    const [rows] = await db.query(
      `
            SELECT u.*, 
                   p.name as property_name, 
                   ut.name as type_name,
                   (SELECT COUNT(*) FROM leases l 
                    WHERE l.unit_id = u.unit_id 
                    AND l.status = 'active' 
                    AND l.start_date <= CURRENT_DATE() 
                    AND (l.end_date IS NULL OR l.end_date >= CURRENT_DATE())) as active_lease_count,
                   (SELECT COUNT(*) FROM leases l 
                    WHERE l.unit_id = u.unit_id 
                    AND l.status IN ('active', 'pending')
                    AND l.start_date > CURRENT_DATE() 
                    AND l.deleted_at IS NULL) as future_lease_count
            FROM units u
            JOIN properties p ON u.property_id = p.property_id
            JOIN unit_types ut ON u.unit_type_id = ut.type_id
            WHERE u.property_id = ? AND u.is_archived = FALSE
            ORDER BY u.unit_number ASC
        `,
      [propertyId]
    );
    return this.mapRows(rows);
  }

  async update(id, updates, connection = null) {
    const fields = [];
    const values = [];

    if (updates.unitNumber !== undefined) {
      fields.push('unit_number = ?');
      values.push(updates.unitNumber);
    }
    if (updates.unitTypeId !== undefined) {
      fields.push('unit_type_id = ?');
      values.push(updates.unitTypeId);
    }
    if (updates.monthlyRent !== undefined) {
      fields.push('monthly_rent = ?');
      values.push(updates.monthlyRent);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.imageUrl !== undefined) {
      fields.push('image_url = ?');
      values.push(updates.imageUrl);
    }

    if (fields.length === 0) return false;

    values.push(id);

    const dbConn = connection || db;
    const [result] = await dbConn.query(
      `UPDATE units SET ${fields.join(', ')} WHERE unit_id = ? AND is_archived = FALSE`,
      values
    );
    return result.affectedRows > 0;
  }

  async delete(id, connection = null) {
    const dbConn = connection || db;
    const [result] = await dbConn.query(
      "UPDATE units SET archived_at = NOW(), is_archived = TRUE, status = 'inactive' WHERE unit_id = ?",
      [id]
    );
    return result.affectedRows > 0;
  }

  async archiveByPropertyId(propertyId, connection = null) {
    const dbConn = connection || db;
    const [result] = await dbConn.query(
      "UPDATE units SET archived_at = NOW(), is_archived = TRUE, status = 'inactive' WHERE property_id = ? AND is_archived = FALSE",
      [propertyId]
    );
    return result.affectedRows >= 0;
  }

  mapRows(rows) {
    return rows.map((row) => {
      // Dynamic Status Logic:
      // If active_lease_count > 0, override status to 'occupied'.
      // EXCEPT if status is 'maintenance' (Maintenance usually overrides Occupancy? Or concurrent?)
      // Assuming Maintenance blocks occupancy, so if it is 'maintenance', kept it.
      // But if there is an ACTIVE lease, it really should be occupied.
      // Let's say Active Lease > All.

      let status = row.status;
      if (row.active_lease_count > 0) {
        status = 'occupied';
      } else if (row.future_lease_count > 0) {
        status = 'reserved';
      }

      return {
        id: row.unit_id.toString(),
        propertyId: row.property_id.toString(),
        unitNumber: row.unit_number,
        unitTypeId: row.unit_type_id,
        type: row.type_name,
        monthlyRent: parseFloat(row.monthly_rent),
        status: status,
        image: row.image_url,
        createdAt: row.created_at,
        propertyName: row.property_name,
      };
    });
  }


  async updateImageUrl(unitId, imageUrl, connection = null) {
    const dbConn = connection || db;
    const [result] = await dbConn.query(
      'UPDATE units SET image_url = ? WHERE unit_id = ?',
      [imageUrl, unitId]
    );
    return result.affectedRows > 0;
  }

  async countOccupied(propertyId) {
    const [rows] = await db.query(
      "SELECT COUNT(*) as count FROM units WHERE property_id = ? AND is_archived = FALSE AND status IN ('occupied', 'maintenance')",
      [propertyId]
    );
    return rows[0].count;
  }

  // Analytics optimized query to avoid O(N) memory buildup
  async getOccupancyStats(propertyIds = []) {
    if (!propertyIds || propertyIds.length === 0) return {};

    const [rows] = await db.query(
      `
      SELECT 
        COALESCE(p.name, CONCAT('Property ', u.property_id)) AS property_name,
        COUNT(u.unit_id) AS total,
        SUM(CASE WHEN u.status = 'occupied' THEN 1 ELSE 0 END) AS occupied,
        GROUP_CONCAT(CASE WHEN u.status != 'occupied' THEN u.unit_number ELSE NULL END) AS vacancies
      FROM units u
      LEFT JOIN properties p ON u.property_id = p.property_id
      WHERE u.property_id IN (?) AND u.is_archived = FALSE
      GROUP BY u.property_id
      `,
      [propertyIds]
    );

    // Transform string vacancies back into array mapping Report Service expectations
    const propertyStats = {};
    rows.forEach(row => {
      propertyStats[row.property_name] = {
        total: row.total,
        occupied: row.occupied,
        vacancies: row.vacancies ? row.vacancies.split(',') : []
      }
    });
    
    return propertyStats;
  }
}

export default new UnitModel();
