// ============================================================================
//  UNIT TYPE MODEL (The Room Glossary)
// ============================================================================
//  Defines granular room configurations.
// ============================================================================

import db from '../config/db.js';

class UnitTypeModel {
  // FIND ALL: Lists the standard room/apartment classifications available in the system.
  async findAll() {
    // 1. [QUERY] Alphabetical Extraction
    const [rows] = await db.query(`
            SELECT type_id AS id, name, description
            FROM unit_types 
            ORDER BY name ASC
        `);
    return rows;
  }

  // FIND BY ID: Fetches a specific configuration definition.
  async findById(id) {
    // 1. [QUERY] Point Retrieval
    const [rows] = await db.query(
      `SELECT type_id AS id, name, description
            FROM unit_types 
            WHERE type_id = ?`,
      [id]
    );
    return rows[0];
  }

  // CREATE: Adds a new classification category (e.g., "Triple Room", "Penthouse").
  async create(data) {
    const { name, description } = data;
    // 1. [DATA] Persistence
    const [result] = await db.query(
      `INSERT INTO unit_types (name, description) VALUES (?, ?)`,
      [name, description]
    );
    return result.insertId;
  }

  // UPDATE: Modifies the naming or descriptive identity of a room class.
  async update(id, data) {
    const { name, description } = data;
    // 1. [DATA] Persistence
    const [result] = await db.query(
      `UPDATE unit_types SET name = ?, description = ? WHERE type_id = ?`,
      [name, description, id]
    );
    return result.affectedRows > 0;
  }

  // DELETE: Purges a room category from the registry.
  async delete(id) {
    // 1. [DATA] Cleanup: Note - this will fail if units are currently tied to this type (foreign key constraint)
    const [result] = await db.query(
      `DELETE FROM unit_types WHERE type_id = ?`,
      [id]
    );
    return result.affectedRows > 0;
  }
}

export default new UnitTypeModel();
