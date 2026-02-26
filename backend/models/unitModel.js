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
                    AND l.end_date >= CURRENT_DATE()) as active_lease_count
            FROM units u
            JOIN properties p ON u.property_id = p.property_id
            JOIN unit_types ut ON u.unit_type_id = ut.type_id
            ORDER BY u.created_at DESC
        `);
    return this.mapRows(rows);
  }

  async findById(id) {
    const [rows] = await db.query(
      `
            SELECT u.*, 
                   p.name as property_name, 
                   ut.name as type_name,
                   (SELECT COUNT(*) FROM leases l 
                    WHERE l.unit_id = u.unit_id 
                    AND l.status = 'active' 
                    AND l.start_date <= CURRENT_DATE() 
                    AND l.end_date >= CURRENT_DATE()) as active_lease_count
            FROM units u
            JOIN properties p ON u.property_id = p.property_id
            JOIN unit_types ut ON u.unit_type_id = ut.type_id
            WHERE u.unit_id = ?
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
                    AND l.end_date >= CURRENT_DATE()) as active_lease_count
            FROM units u
            JOIN properties p ON u.property_id = p.property_id
            JOIN unit_types ut ON u.unit_type_id = ut.type_id
            WHERE u.unit_id = ?
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
                    AND l.end_date >= CURRENT_DATE()) as active_lease_count
            FROM units u
            JOIN properties p ON u.property_id = p.property_id
            JOIN unit_types ut ON u.unit_type_id = ut.type_id
            WHERE u.property_id = ?
            ORDER BY u.unit_number ASC
        `,
      [propertyId]
    );
    return this.mapRows(rows);
  }

  async update(id, updates, connection = null) {
    const fields = [];
    const values = [];

    if (updates.unitNumber) {
      fields.push('unit_number = ?');
      values.push(updates.unitNumber);
    }
    if (updates.unitTypeId) {
      fields.push('unit_type_id = ?');
      values.push(updates.unitTypeId);
    }
    if (updates.monthlyRent) {
      fields.push('monthly_rent = ?');
      values.push(updates.monthlyRent);
    }
    if (updates.status) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.imageUrl) {
      fields.push('image_url = ?');
      values.push(updates.imageUrl);
    }

    if (fields.length === 0) return false;

    values.push(id);

    const dbConn = connection || db;
    const [result] = await dbConn.query(
      `UPDATE units SET ${fields.join(', ')} WHERE unit_id = ?`,
      values
    );
    return result.affectedRows > 0;
  }

  async delete(id) {
    try {
      const [result] = await db.query('DELETE FROM units WHERE unit_id = ?', [
        id,
      ]);
      return result.affectedRows > 0;
    } catch (error) {
       if (error.errno === 1451) {
         throw new Error('Cannot delete unit because it has associated historical records (e.g. leases or maintenance requests).');
       }
       throw error;
    }
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
      "SELECT COUNT(*) as count FROM units WHERE property_id = ? AND status IN ('occupied', 'maintenance')",
      [propertyId]
    );
    return rows[0].count;
  }
}

export default new UnitModel();
