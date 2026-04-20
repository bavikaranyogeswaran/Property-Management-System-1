// ============================================================================
//  PROPERTY TYPE MODEL (The Building Glossary)
// ============================================================================
//  Defines categories like Apartment, Commercial, etc.
// ============================================================================

import db from '../config/db.js';

class PropertyTypeModel {
  // FIND ALL: System-wide registry of all available property classifications (Residential, Commercial, etc.)
  async findAll() {
    // 1. [QUERY] Extraction: Sorting alphabetically for consistent UI dropdowns
    const [rows] = await db.query(`
            SELECT 
                type_id AS id,
                name,
                description
            FROM property_types 
            ORDER BY name ASC
        `);
    return rows;
  }

  // FIND BY ID: Fetches a specific classification by its unique identifier.
  async findById(id) {
    // 1. [QUERY] Direct Retrieval
    const [rows] = await db.query(
      `SELECT 
                type_id AS id,
                name,
                description
            FROM property_types 
            WHERE type_id = ?`,
      [id]
    );
    return rows[0];
  }

  // CREATE: Records a new category of property that can be managed.
  async create(data) {
    const { name, description } = data;
    // 1. [DATA] Persistence
    const [result] = await db.query(
      `INSERT INTO property_types (name, description) VALUES (?, ?)`,
      [name, description]
    );
    return result.insertId;
  }

  // UPDATE: Modifies the definition or name of an existing property category.
  async update(id, data) {
    const { name, description } = data;
    // 1. [DATA] Persistence
    const [result] = await db.query(
      `UPDATE property_types SET name = ?, description = ? WHERE type_id = ?`,
      [name, description, id]
    );
    return result.affectedRows > 0;
  }

  // DELETE: Removes a property category from the system catalogue.
  async delete(id) {
    // 1. [DATA] Cleanup
    const [result] = await db.query(
      `DELETE FROM property_types WHERE type_id = ?`,
      [id]
    );
    return result.affectedRows > 0;
  }
}

export default new PropertyTypeModel();
