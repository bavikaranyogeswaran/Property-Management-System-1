// ============================================================================
//  MAINTENANCE REQUEST MODEL (The Complaint Box)
// ============================================================================
//  This file stores all the reports about broken things ("The AC is dead").
//  It helps us track what needs fixing and who asked for it.
// ============================================================================

import pool from '../config/db.js';

class MaintenanceRequestModel {
  // FIND ALL: System-wide registry of all maintenance tickets.
  async findAll() {
    // 1. [QUERY] Aggregate Subquery: Embeds image objects directly into the request rows
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
      images: row.images,
      eta: row.eta,
      resolutionNotes: row.resolution_notes,
      resolvedAt: row.resolved_at,
    }));
  }

  // FIND BY OWNER ID: Filters tickets to those within properties owned by the specific user.
  async findByOwnerId(ownerId) {
    // 1. [QUERY] Filtered Join
    const [rows] = await pool.query(
      `SELECT mr.*, 
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
            ORDER BY mr.created_at DESC`,
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

  // FIND BY TREASURER ID: Limits view to tickets in properties assigned to the specific staff member.
  async findByTreasurerId(treasurerId) {
    // 1. [QUERY] RBAC Filtered Retrieval
    const [rows] = await pool.query(
      `SELECT mr.*, 
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
            ORDER BY mr.created_at DESC`,
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

  // FIND BY ID: Fetches a single ticket with its full image gallery.
  async findById(id) {
    // 1. [QUERY] Direct Retrieval
    const [rows] = await pool.query(
      `SELECT mr.*, 
            COALESCE(
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', mi.image_id, 'url', mi.image_url)) 
                 FROM maintenance_images mi 
                 WHERE mi.request_id = mr.request_id),
                JSON_ARRAY()
            ) as images
            FROM maintenance_requests mr 
            WHERE mr.request_id = ?`,
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
      images: row.images,
      eta: row.eta,
      resolutionNotes: row.resolution_notes,
      resolvedAt: row.resolved_at,
    };
  }

  // FIND BY PROPERTY ID: Lists all ongoing maintenance for a specific apartment block.
  async findByPropertyId(propertyId) {
    // 1. [QUERY] Filtered Join
    const [rows] = await pool.query(
      `SELECT mr.*,
            COALESCE(
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', mi.image_id, 'url', mi.image_url)) 
                 FROM maintenance_images mi 
                 WHERE mi.request_id = mr.request_id),
            JSON_ARRAY()
            ) as images
            FROM maintenance_requests mr
            JOIN units u ON mr.unit_id = u.unit_id
            WHERE u.property_id = ?
            ORDER BY mr.created_at DESC`,
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

  // FIND BY TENANT ID: Registry of issues reported by a specific occupant.
  async findByTenantId(tenantId) {
    // 1. [QUERY] Direct Filtered Retrieval
    const [rows] = await pool.query(
      `SELECT mr.*,
            COALESCE(
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', mi.image_id, 'url', mi.image_url)) 
                 FROM maintenance_images mi 
                 WHERE mi.request_id = mr.request_id),
            JSON_ARRAY()
            ) as images
            FROM maintenance_requests mr 
            WHERE mr.tenant_id = ?
            ORDER BY mr.created_at DESC`,
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

  // CREATE REQUEST: Writing down a new complaint card with transactional image embedding.
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
      // 1. [ATOMIC] Begin Transaction: Ensure request and images are saved together
      await connection.beginTransaction();

      // 2. [DATA] Persistence: Insert the primary request metadata
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

      // 3. [DATA] Multi-Persistence: Batch insert image URLs if provided
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
      // 4. [ROLLBACK] Failure Guard: Atomic cleanup on error
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // UPDATE STATUS: Moves a ticket through the lifecycle (e.g., submitted -> in_progress -> completed).
  async updateStatus(id, status, assignmentData = {}) {
    const { assignedTo, assignedBy, eta, resolutionNotes } = assignmentData;
    let query = 'UPDATE maintenance_requests SET status = ?';
    const params = [status];

    // 1. [TRANSFORMATION] Dynamic Field Application: Only update provided metadata
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

    // 2. [DATA] State Persistence
    await pool.query(query, params);
    return this.findById(id);
  }

  // UPDATE: Simple metadata update (currently mainly focused on status).
  async update(id, data) {
    const { status } = data;
    // 1. [DATA] Persistence
    if (status) {
      await pool.query(
        'UPDATE maintenance_requests SET status = ? WHERE request_id = ?',
        [status, id]
      );
    }
    return this.findById(id);
  }

  // COUNT OPEN BY UNIT: Real-time tally of unresolved issues for a specific unit.
  async countOpenByUnitId(unitId, connection = null) {
    const db = connection || pool;
    // 1. [QUERY] Filtered Aggregation
    const [rows] = await db.query(
      "SELECT COUNT(*) as count FROM maintenance_requests WHERE unit_id = ? AND status IN ('submitted', 'in_progress')",
      [unitId]
    );
    return rows[0].count;
  }

  // FIND RECENT DUPLICATE: Anti-spam lock to prevent identical reports within 5 minutes.
  async findRecentDuplicate(unitId, tenantId, title, description) {
    // 1. [SECURITY] Throttling Lock: Checks for exact content match within a small time window
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
