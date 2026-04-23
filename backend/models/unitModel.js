// ============================================================================
//  UNIT MODEL (The Room Details)
// ============================================================================
//  This file manages the specific details of each room or apartment.
//  It knows the Unit Number (e.g., "A101"), the Rent Price, and the Type.
// ============================================================================

import db from '../config/db.js';

class UnitModel {
  // CREATE UNIT: Adds a new rental inventory item to a property.
  async create(data) {
    const {
      propertyId,
      unitNumber,
      unitTypeId,
      monthlyRent,
      status,
      imageUrl,
    } = data;
    // 1. [DATA] Persistence: records the core unit attributes with an initial availability state
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

  // BASE QUERY: Centralizes the complex SELECT logic for resolution across all find methods.
  _getBaseQuery() {
    // 1. [QUERY] Multi-Join: Resolves property metadata, unit types, and occupancy counts (active/future/pending)
    // Supports primary image resolution and dynamic status calculation.
    return `
      SELECT u.*, 
             p.name as property_name, 
             p.status as property_status,
             p.is_archived as property_archived,
             ut.name as type_name,
             COALESCE(
               (SELECT ui.image_url FROM unit_images ui WHERE ui.unit_id = u.unit_id AND ui.is_primary = TRUE LIMIT 1),
               u.image_url
             ) AS resolved_image_url,
             COUNT(DISTINCT CASE WHEN l.status = 'active' AND l.start_date <= CURRENT_DATE() AND (l.end_date IS NULL OR l.end_date >= CURRENT_DATE()) THEN l.lease_id END) as active_lease_count,
             COUNT(DISTINCT CASE WHEN l.status IN ('active', 'pending') AND l.start_date > CURRENT_DATE() THEN l.lease_id END) as future_lease_count,
             COUNT(DISTINCT CASE WHEN l.status IN ('draft', 'pending') AND (l.reservation_expires_at IS NULL OR l.reservation_expires_at >= CURRENT_DATE()) THEN l.lease_id END) as pending_application_count
      FROM units u
      JOIN properties p ON u.property_id = p.property_id
      JOIN unit_types ut ON u.unit_type_id = ut.type_id
      LEFT JOIN leases l ON u.unit_id = l.unit_id
    `;
  }

  // FIND ALL: Lists all active inventory across the portfolio.
  async findAll() {
    // 1. [QUERY] Extraction using base query with group-by for lease counts
    const [rows] = await db.query(`
      ${this._getBaseQuery()}
      WHERE u.is_archived = FALSE
      GROUP BY u.unit_id
      ORDER BY u.created_at DESC
    `);
    return this.mapRows(rows);
  }

  // FIND BY ID: Fetches a single unit profile.
  async findById(id, connection = null) {
    const dbConn = connection || db;
    // 1. [QUERY] Filtered Retrieval
    const [rows] = await dbConn.query(
      `
      ${this._getBaseQuery()}
      WHERE u.unit_id = ? AND u.is_archived = FALSE
      GROUP BY u.unit_id
    `,
      [id]
    );
    if (rows.length === 0) return null;
    return this.mapRows(rows)[0];
  }

  // FIND BY ID FOR UPDATE: Forces row-level locking for transactional unit status changes.
  async findByIdForUpdate(id, connection) {
    // 1. [SECURITY] Locking: Execute SELECT FOR UPDATE to prevent concurrent over-leasing
    const [rows] = await connection.query(
      `
      ${this._getBaseQuery()}
      WHERE u.unit_id = ? AND u.is_archived = FALSE
      GROUP BY u.unit_id
      FOR UPDATE
    `,
      [id]
    );
    if (rows.length === 0) return null;
    return this.mapRows(rows)[0];
  }

  // FIND BY PROPERTY ID: Lists the inventory for a specific building.
  async findByPropertyId(propertyId) {
    // 1. [QUERY] Grouped Retrieval sorted by unit identity
    const [rows] = await db.query(
      `
      ${this._getBaseQuery()}
      WHERE u.property_id = ? AND u.is_archived = FALSE
      GROUP BY u.unit_id
      ORDER BY u.unit_number ASC
    `,
      [propertyId]
    );
    return this.mapRows(rows);
  }

  // UPDATE: Modifies unit metadata and performs automated rent auditing.
  async update(id, updates, connection = null) {
    const fields = [];
    const values = [];

    // 1. [TRANSFORMATION] Field Mapping
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

    // 2. [AUDIT] Rent Change Detection: Snapshot history if pricing is updated
    if (updates.monthlyRent !== undefined) {
      const dbConnForHistory = connection || db;
      const [currentUnit] = await dbConnForHistory.query(
        'SELECT monthly_rent FROM units WHERE unit_id = ? AND is_archived = FALSE',
        [id]
      );
      if (
        currentUnit[0] &&
        Number(currentUnit[0].monthly_rent) !== Number(updates.monthlyRent)
      ) {
        await this._logRentChange(
          id,
          Number(currentUnit[0].monthly_rent),
          Number(updates.monthlyRent),
          updates._changedBy || null,
          connection
        );
      }
    }

    values.push(id);
    const dbConn = connection || db;
    // 3. [DATA] Persistence
    const [result] = await dbConn.query(
      `UPDATE units SET ${fields.join(', ')} WHERE unit_id = ? AND is_archived = FALSE`,
      values
    );
    return result.affectedRows > 0;
  }

  // DELETE: Soft-archives a unit and cleans up storage assets.
  async delete(id, connection = null) {
    const dbConn = connection || db;

    // 1. [QUERY] Capture associated image assets for cleanup
    const [images] = await dbConn.query(
      'SELECT image_url FROM unit_images WHERE unit_id = ?',
      [id]
    );

    // 2. [DATA] Archival: Flags unit as hidden while maintaining historical lease links
    const [result] = await dbConn.query(
      "UPDATE units SET archived_at = NOW(), is_archived = TRUE, status = 'inactive' WHERE unit_id = ?",
      [id]
    );
    const success = result.affectedRows > 0;

    // 3. [SIDE-EFFECT] Storage Cleanup: Queue Cloudinary deletion tasks
    if (success && images.length > 0) {
      const { mainQueue } = await import('../config/queue.js');
      const { extractPublicId } = await import('../utils/cloudinaryUtils.js');

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

  // ARCHIVE BY PROPERTY ID: Bulk soft-delete of all units when a property is decommissioned.
  async archiveByPropertyId(propertyId, connection = null) {
    const dbConn = connection || db;
    // 1. [DATA] Persistence
    const [result] = await dbConn.query(
      "UPDATE units SET archived_at = NOW(), is_archived = TRUE, status = 'inactive' WHERE property_id = ? AND is_archived = FALSE",
      [propertyId]
    );
    return result.affectedRows >= 0;
  }

  // MAP ROWS: Standardizes the rich join results and resolves virtual occupancy states.
  mapRows(rows) {
    return rows.map((row) => {
      // 1. [LOGIC] Dynamic Status Resolution: Occupancy/Lease counts take precedence over manual status flags
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
        imageUrl: row.resolved_image_url || row.image_url,
        isTurnoverCleared: Boolean(row.is_turnover_cleared),
        createdAt: row.created_at,
        propertyName: row.property_name,
        propertyStatus: row.property_status,
        propertyArchived: Boolean(row.property_archived),
        pendingApplicationsCount: Number(row.pending_application_count || 0),
      };
    });
  }

  // UPDATE IMAGE URL: Fast-path for updating the legacy fallback image field.
  async updateImageUrl(unitId, imageUrl, connection = null) {
    const dbConn = connection || db;
    // 1. [DATA] Persistence
    const [result] = await dbConn.query(
      'UPDATE units SET image_url = ? WHERE unit_id = ?',
      [imageUrl, unitId]
    );
    return result.affectedRows > 0;
  }

  // LOG RENT CHANGE: Administrative audit of pricing history.
  async _logRentChange(
    unitId,
    previousRent,
    newRent,
    changedBy = null,
    connection = null
  ) {
    const dbConn = connection || db;
    try {
      // 1. [DATA] Append entry to the unit pricing ledger
      await dbConn.query(
        'INSERT INTO unit_rent_history (unit_id, previous_rent, new_rent, changed_by) VALUES (?, ?, ?, ?)',
        [unitId, previousRent, newRent, changedBy]
      );
    } catch (err) {
      console.error(
        `[RentHistory] Failed to log rent change for unit ${unitId}:`,
        err.message
      );
    }
  }

  // COUNT OCCUPIED: Aggregate count of non-vacant units at the building level.
  async countOccupied(propertyId) {
    // 1. [QUERY] Logic: counts units that are either blocked by status or tied to an active/active-pending lease
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

  // GET OCCUPANCY STATS: Analytics optimized dump of portfolio utilization.
  async getOccupancyStats(propertyIds = [], targetDate = null) {
    if (!propertyIds || propertyIds.length === 0) return {};

    const dateStr = targetDate ? `'${targetDate}'` : 'CURRENT_DATE()';

    // 1. [QUERY] Massive Aggregation: Performs unit-level checks for the entire portfolio in one round-trip
    const [rows] = await db.query(
      `SELECT 
        COALESCE(p.name, CONCAT('Property ', u.property_id)) AS propertyName,
        COUNT(DISTINCT u.unit_id) AS total,
        COUNT(DISTINCT CASE 
          WHEN (l.status = 'active' AND l.start_date <= ${dateStr} AND (l.end_date IS NULL OR l.end_date >= ${dateStr})) THEN u.unit_id
          ELSE NULL 
        END) AS occupied,
        COUNT(DISTINCT CASE 
          WHEN u.status IN ('reserved', 'maintenance') THEN u.unit_id
          WHEN (l.status IN ('active', 'pending', 'draft') AND (l.start_date > ${dateStr} OR (l.status = 'draft' AND (l.reservation_expires_at IS NULL OR l.reservation_expires_at >= ${dateStr})))) THEN u.unit_id
          ELSE NULL 
        END) AS reserved,
        GROUP_CONCAT(DISTINCT CASE 
          WHEN u.status IN ('maintenance', 'reserved') THEN NULL
          WHEN (l.status = 'active' AND l.start_date <= ${dateStr} AND (l.end_date IS NULL OR l.end_date >= ${dateStr})) THEN NULL
          WHEN (l.status IN ('active', 'pending', 'draft') AND (l.start_date > ${dateStr} OR (l.status = 'draft' AND (l.reservation_expires_at IS NULL OR l.reservation_expires_at >= ${dateStr})))) THEN NULL
          ELSE u.unit_number 
        END) AS vacancies
      FROM units u
      LEFT JOIN properties p ON u.property_id = p.property_id
      LEFT JOIN leases l ON u.unit_id = l.unit_id
      WHERE u.property_id IN (?) AND u.is_archived = FALSE
      GROUP BY u.property_id`,
      [propertyIds]
    );

    // 2. [TRANSFORMATION] Post-Processing: Resolves string-concatenated vacancies back into a clean report structure
    const propertyStats = {};
    rows.forEach((row) => {
      propertyStats[row.propertyName] = {
        total: row.total,
        occupied: row.occupied,
        reserved: row.reserved,
        vacancies: row.vacancies ? row.vacancies.split(',') : [],
      };
    });

    return propertyStats;
  }
}

export default new UnitModel();
