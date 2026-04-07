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
                   COUNT(DISTINCT CASE WHEN l.status = 'active' AND l.start_date <= CURRENT_DATE() AND (l.end_date IS NULL OR l.end_date >= CURRENT_DATE()) THEN l.lease_id END) as active_lease_count,
                   COUNT(DISTINCT CASE WHEN l.status IN ('active', 'pending') AND l.start_date > CURRENT_DATE() THEN l.lease_id END) as future_lease_count,
                   COUNT(DISTINCT CASE WHEN l.status IN ('draft', 'pending') AND (l.reservation_expires_at IS NULL OR l.reservation_expires_at >= CURRENT_DATE()) THEN l.lease_id END) as pending_application_count
            FROM units u
            JOIN properties p ON u.property_id = p.property_id
            JOIN unit_types ut ON u.unit_type_id = ut.type_id
            LEFT JOIN leases l ON u.unit_id = l.unit_id
            WHERE u.is_archived = FALSE
            GROUP BY u.unit_id
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
                   COUNT(DISTINCT CASE WHEN l.status = 'active' AND l.start_date <= CURRENT_DATE() AND (l.end_date IS NULL OR l.end_date >= CURRENT_DATE()) THEN l.lease_id END) as active_lease_count,
                   COUNT(DISTINCT CASE WHEN l.status IN ('active', 'pending') AND l.start_date > CURRENT_DATE() THEN l.lease_id END) as future_lease_count,
                   COUNT(DISTINCT CASE WHEN l.status IN ('draft', 'pending') AND (l.reservation_expires_at IS NULL OR l.reservation_expires_at >= CURRENT_DATE()) THEN l.lease_id END) as pending_application_count
            FROM units u
            JOIN properties p ON u.property_id = p.property_id
            JOIN unit_types ut ON u.unit_type_id = ut.type_id
            LEFT JOIN leases l ON u.unit_id = l.unit_id
            WHERE u.unit_id = ? AND u.is_archived = FALSE
            GROUP BY u.unit_id
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
                   COUNT(DISTINCT CASE WHEN l.status = 'active' AND l.start_date <= CURRENT_DATE() AND (l.end_date IS NULL OR l.end_date >= CURRENT_DATE()) THEN l.lease_id END) as active_lease_count,
                   COUNT(DISTINCT CASE WHEN l.status IN ('active', 'pending') AND l.start_date > CURRENT_DATE() THEN l.lease_id END) as future_lease_count,
                   COUNT(DISTINCT CASE WHEN l.status IN ('draft', 'pending') AND (l.reservation_expires_at IS NULL OR l.reservation_expires_at >= CURRENT_DATE()) THEN l.lease_id END) as pending_application_count
            FROM units u
            JOIN properties p ON u.property_id = p.property_id
            JOIN unit_types ut ON u.unit_type_id = ut.type_id
            LEFT JOIN leases l ON u.unit_id = l.unit_id
            WHERE u.unit_id = ? AND u.is_archived = FALSE
            GROUP BY u.unit_id
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
                   COUNT(DISTINCT CASE WHEN l.status = 'active' AND l.start_date <= CURRENT_DATE() AND (l.end_date IS NULL OR l.end_date >= CURRENT_DATE()) THEN l.lease_id END) as active_lease_count,
                   COUNT(DISTINCT CASE WHEN l.status IN ('active', 'pending') AND l.start_date > CURRENT_DATE() THEN l.lease_id END) as future_lease_count,
                   COUNT(DISTINCT CASE WHEN l.status IN ('draft', 'pending') AND (l.reservation_expires_at IS NULL OR l.reservation_expires_at >= CURRENT_DATE()) THEN l.lease_id END) as pending_application_count
            FROM units u
            JOIN properties p ON u.property_id = p.property_id
            JOIN unit_types ut ON u.unit_type_id = ut.type_id
            LEFT JOIN leases l ON u.unit_id = l.unit_id
            WHERE u.property_id = ? AND u.is_archived = FALSE
            GROUP BY u.unit_id
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
    if (updates.isTurnoverCleared !== undefined) {
      fields.push('is_turnover_cleared = ?');
      values.push(updates.isTurnoverCleared ? 1 : 0);
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

    // 1. Fetch all associated image URLs before archival/deletion
    const [images] = await dbConn.query(
      'SELECT image_url FROM unit_images WHERE unit_id = ?',
      [id]
    );

    // 2. Perform the soft-delete
    const [result] = await dbConn.query(
      "UPDATE units SET archived_at = NOW(), is_archived = TRUE, status = 'inactive' WHERE unit_id = ?",
      [id]
    );

    const success = result.affectedRows > 0;

    // 3. Enqueue Cloudinary cleanup if archival was successful
    if (success && images.length > 0) {
      const { mainQueue } = await import('../config/queue.js');
      const { extractPublicId } = await import('../utils/cronJobs.js');

      for (const img of images) {
        const publicId = extractPublicId(img.image_url);
        if (publicId) {
          mainQueue.add(
            'cleanup_cloudinary_asset_task',
            { publicId },
            { attempts: 3, backoff: 30000 }
          );
        }
      }
    }

    return success;
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
      } else if (
        row.pending_application_count > 0 ||
        row.future_lease_count > 0
      ) {
        status = 'reserved';
      }

      return {
        id: row.unit_id.toString(),
        propertyId: row.property_id.toString(),
        unitNumber: row.unit_number,
        unitTypeId: row.unit_type_id,
        type: row.type_name,
        monthlyRent: Number(row.monthly_rent),
        status: status,
        imageUrl: row.image_url,
        isTurnoverCleared: Boolean(row.is_turnover_cleared),
        createdAt: row.created_at,
        propertyName: row.property_name,
        pendingApplicationsCount: Number(row.pending_application_count || 0),
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
      `SELECT COUNT(DISTINCT u.unit_id) as count 
       FROM units u
       LEFT JOIN leases l ON u.unit_id = l.unit_id
       WHERE u.property_id = ? AND u.is_archived = FALSE 
       AND (
         u.status = 'maintenance' OR
         u.status = 'reserved' OR
         (l.status = 'active' AND l.start_date <= CURRENT_DATE() AND (l.end_date IS NULL OR l.end_date >= CURRENT_DATE())) OR
         (l.status IN ('active', 'pending', 'draft') AND (l.start_date > CURRENT_DATE() OR (l.status = 'draft' AND (l.reservation_expires_at IS NULL OR l.reservation_expires_at >= CURRENT_DATE()))))
       )`,
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
        COALESCE(p.name, CONCAT('Property ', u.property_id)) AS propertyName,
        COUNT(DISTINCT u.unit_id) AS total,
        COUNT(DISTINCT CASE 
          WHEN u.status IN ('maintenance', 'reserved') THEN u.unit_id
          WHEN (l.status = 'active' AND l.start_date <= CURRENT_DATE() AND (l.end_date IS NULL OR l.end_date >= CURRENT_DATE())) THEN u.unit_id
          WHEN (l.status IN ('active', 'pending', 'draft') AND (l.start_date > CURRENT_DATE() OR (l.status = 'draft' AND (l.reservation_expires_at IS NULL OR l.reservation_expires_at >= CURRENT_DATE())))) THEN u.unit_id
          ELSE NULL 
        END) AS occupied,
        GROUP_CONCAT(DISTINCT CASE 
          WHEN u.status IN ('maintenance', 'reserved') THEN NULL
          WHEN (l.status = 'active' AND l.start_date <= CURRENT_DATE() AND (l.end_date IS NULL OR l.end_date >= CURRENT_DATE())) THEN NULL
          WHEN (l.status IN ('active', 'pending', 'draft') AND (l.start_date > CURRENT_DATE() OR (l.status = 'draft' AND (l.reservation_expires_at IS NULL OR l.reservation_expires_at >= CURRENT_DATE())))) THEN NULL
          ELSE u.unit_number 
        END) AS vacancies
      FROM units u
      LEFT JOIN properties p ON u.property_id = p.property_id
      LEFT JOIN leases l ON u.unit_id = l.unit_id
      WHERE u.property_id IN (?) AND u.is_archived = FALSE
      GROUP BY u.property_id
      `,
      [propertyIds]
    );

    // Transform string vacancies back into array mapping Report Service expectations
    const propertyStats = {};
    rows.forEach((row) => {
      propertyStats[row.propertyName] = {
        total: row.total,
        occupied: row.occupied,
        vacancies: row.vacancies ? row.vacancies.split(',') : [],
      };
    });

    return propertyStats;
  }
}

export default new UnitModel();
