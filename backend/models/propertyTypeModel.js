import db from '../config/db.js';

class PropertyTypeModel {
  async findAll() {
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

  async findById(id) {
    const [rows] = await db.query(
      `
            SELECT 
                type_id AS id,
                name,
                description
            FROM property_types 
            WHERE type_id = ?
        `,
      [id]
    );
    return rows[0];
  }

  async create(data) {
    const { name, description } = data;
    const [result] = await db.query(
      `INSERT INTO property_types (name, description) VALUES (?, ?)`,
      [name, description]
    );
    return result.insertId;
  }

  async update(id, data) {
    const { name, description } = data;
    const [result] = await db.query(
      `UPDATE property_types SET name = ?, description = ? WHERE type_id = ?`,
      [name, description, id]
    );
    return result.affectedRows > 0;
  }

  async delete(id) {
    const [result] = await db.query(
      `DELETE FROM property_types WHERE type_id = ?`,
      [id]
    );
    return result.affectedRows > 0;
  }
}

export default new PropertyTypeModel();
