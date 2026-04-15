// ============================================================================
//  MAINTENANCE REQUEST MODEL (The Complaint Box)
// ============================================================================
//  This file stores all the reports about broken things ("The AC is dead").
//  It helps us track what needs fixing and who asked for it.
// ============================================================================

import pool from '../config/db.js';

class MaintenanceRequestModel {
  async findAll() {
    const [rows] = await pool.query(`
            SELECT mr.*, 
            COALESCE(
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', mi.image_id, 'url', mi.image_url)) 
                 FROM maintenance_images mi 
                 WHERE mi.request_id = mr.request_id),
                JSON_ARRAY()
            ) as images
            FROM maintenance_requests mr 
            ORDER BY mr.created_at DESC
        `);
    return rows.map((row) => ({
      id: row.request_id.toString(),
      unitId: row.unit_id.toString(),
      tenantId: row.tenant_id.toString(),
      title: row.title,
      description: row.description,
      priority: row.priority,
      status: row.status,
      assignedTo: row.assigned_to ? row.assigned_to.toString() : null,
      assignedBy: row.assigned_by ? row.assigned_by.toString() : null,
      images: row.images, // Already JSON
      eta: row.eta,
      resolutionNotes: row.resolution_notes,
      resolvedAt: row.resolved_at,
    }));
  }

  async findByOwnerId(ownerId) {
    const [rows] = await pool.query(
      `
            SELECT mr.*, 
            u.unit_number,
            p.name as property_name,
            COALESCE(
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', mi.image_id, 'url', mi.image_url)) 
                 FROM maintenance_images mi 
                 WHERE mi.request_id = mr.request_id),
                JSON_ARRAY()
            ) as images
            FROM maintenance_requests mr
            JOIN units u ON mr.unit_id = u.unit_id
            JOIN properties p ON u.property_id = p.property_id
            WHERE p.owner_id = ?
            ORDER BY mr.created_at DESC
        `,
      [ownerId]
    );
    return rows.map((row) => ({
      id: row.request_id.toString(),
      unitId: row.unit_id.toString(),
      unitNumber: row.unit_number,
      propertyName: row.property_name,
      tenantId: row.tenant_id.toString(),
      title: row.title,
      description: row.description,
      priority: row.priority,
      status: row.status,
      assignedTo: row.assigned_to ? row.assigned_to.toString() : null,
      assignedBy: row.assigned_by ? row.assigned_by.toString() : null,
      images: row.images,
      eta: row.eta,
      resolutionNotes: row.resolution_notes,
      resolvedAt: row.resolved_at,
    }));
  }

  async findByTreasurerId(treasurerId) {
    const [rows] = await pool.query(
      `
            SELECT mr.*, 
            COALESCE(
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', mi.image_id, 'url', mi.image_url)) 
                 FROM maintenance_images mi 
                 WHERE mi.request_id = mr.request_id),
                JSON_ARRAY()
            ) as images
            FROM maintenance_requests mr
            JOIN units u ON mr.unit_id = u.unit_id
            JOIN staff_property_assignments spa ON u.property_id = spa.property_id
            WHERE spa.user_id = ?
            ORDER BY mr.created_at DESC
        `,
      [treasurerId]
    );
    return rows.map((row) => ({
      id: row.request_id.toString(),
      unitId: row.unit_id.toString(),
      tenantId: row.tenant_id.toString(),
      title: row.title,
      description: row.description,
      priority: row.priority,
      status: row.status,
      createdAt: row.created_at,
      images: row.images,
    }));
  }

  async findById(id) {
    const [rows] = await pool.query(
      `
            SELECT mr.*, 
            COALESCE(
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', mi.image_id, 'url', mi.image_url)) 
                 FROM maintenance_images mi 
                 WHERE mi.request_id = mr.request_id),
                JSON_ARRAY()
            ) as images
            FROM maintenance_requests mr 
            WHERE mr.request_id = ?
        `,
      [id]
    );

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.request_id.toString(),
      unitId: row.unit_id.toString(),
      tenantId: row.tenant_id.toString(),
      title: row.title,
      description: row.description,
      priority: row.priority,
      category: row.category,
      status: row.status,
      assignedTo: row.assigned_to ? row.assigned_to.toString() : null,
      assignedBy: row.assigned_by ? row.assigned_by.toString() : null,
      createdAt: row.created_at,
      images: row.images, // Already JSON
      eta: row.eta,
      resolutionNotes: row.resolution_notes,
      resolvedAt: row.resolved_at,
    };
  }

  async findByPropertyId(propertyId) {
    const [rows] = await pool.query(
      `
            SELECT mr.*,
            COALESCE(
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', mi.image_id, 'url', mi.image_url)) 
                 FROM maintenance_images mi 
                 WHERE mi.request_id = mr.request_id),
            JSON_ARRAY()
            ) as images
            FROM maintenance_requests mr
            JOIN units u ON mr.unit_id = u.unit_id
            WHERE u.property_id = ?
            ORDER BY mr.created_at DESC
                `,
      [propertyId]
    );
    return rows.map((row) => ({
      id: row.request_id.toString(),
      unitId: row.unit_id.toString(),
      tenantId: row.tenant_id.toString(),
      title: row.title,
      description: row.description,
      priority: row.priority,
      category: row.category,
      status: row.status,
      createdAt: row.created_at,
      images: row.images,
    }));
  }

  async findByTenantId(tenantId) {
    const [rows] = await pool.query(
      `
            SELECT mr.*,
            COALESCE(
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', mi.image_id, 'url', mi.image_url)) 
                 FROM maintenance_images mi 
                 WHERE mi.request_id = mr.request_id),
            JSON_ARRAY()
            ) as images
            FROM maintenance_requests mr 
            WHERE mr.tenant_id = ?
            ORDER BY mr.created_at DESC
                `,
      [tenantId]
    );
    return rows.map((row) => ({
      id: row.request_id.toString(),
      unitId: row.unit_id.toString(),
      tenantId: row.tenant_id.toString(),
      title: row.title,
      description: row.description,
      priority: row.priority,
      category: row.category,
      status: row.status,
      createdAt: row.created_at,
      images: row.images,
    }));
  }

  //  CREATE REQUEST: Writing down a new complaint card.
  async create(data) {
    const {
      unitId,
      tenantId,
      title,
      description,
      priority,
      category,
      images,
      assignedTo,
      assignedBy,
    } = data;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        'INSERT INTO maintenance_requests (unit_id, tenant_id, title, description, priority, category, status, assigned_to, assigned_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          unitId,
          tenantId,
          title,
          description,
          priority || 'medium',
          category || 'general',
          'submitted',
          assignedTo || null,
          assignedBy || null,
        ]
      );
      const requestId = result.insertId;

      if (images && images.length > 0) {
        const imageValues = images.map((url) => [requestId, url]);
        await connection.query(
          'INSERT INTO maintenance_images (request_id, image_url) VALUES ?',
          [imageValues]
        );
      }

      await connection.commit();
      return requestId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateStatus(id, status, assignmentData = {}) {
    const { assignedTo, assignedBy, eta, resolutionNotes } = assignmentData;

    let query = 'UPDATE maintenance_requests SET status = ?';
    const params = [status];

    if (assignedTo !== undefined) {
      query += ', assigned_to = ?';
      params.push(assignedTo);
    }
    if (assignedBy !== undefined) {
      query += ', assigned_by = ?';
      params.push(assignedBy);
    }
    if (eta !== undefined) {
      query += ', eta = ?';
      params.push(eta);
    }
    if (resolutionNotes !== undefined) {
      query += ', resolution_notes = ?';
      params.push(resolutionNotes);
    }

    if (status === 'completed' || status === 'closed') {
      query += ', resolved_at = NOW()';
    }

    query += ' WHERE request_id = ?';
    params.push(id);

    await pool.query(query, params);
    return this.findById(id);
  }

  async update(id, data) {
    // Generic update if needed, currently mainly status
    // Add more fields as needed
    const { status } = data;
    if (status) {
      await pool.query(
        'UPDATE maintenance_requests SET status = ? WHERE request_id = ?',
        [status, id]
      );
    }
    return this.findById(id);
  }

  async countOpenByUnitId(unitId, connection = null) {
    const db = connection || pool;
    const [rows] = await db.query(
      "SELECT COUNT(*) as count FROM maintenance_requests WHERE unit_id = ? AND status IN ('submitted', 'in_progress')",
      [unitId]
    );
    return rows[0].count;
  }

  async findRecentDuplicate(unitId, tenantId, title, description) {
    // [HARDENED ANTI-SPAM] Check for EXACT Title + Description match within last 5 minutes
    // This allows different issues (different descriptions) with the same title,
    // but prevents accidental double-clicks or identical spam.
    const [rows] = await pool.query(
      `SELECT request_id FROM maintenance_requests 
       WHERE unit_id = ? AND tenant_id = ? AND title = ? AND description = ? 
       AND created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
       LIMIT 1`,
      [unitId, tenantId, title, description]
    );
    return rows.length > 0;
  }
}

export default new MaintenanceRequestModel();
