export const up = async (connection) => {
  await connection.query(`
    ALTER TABLE maintenance_requests
    MODIFY COLUMN status 
    ENUM('submitted','in_progress','completed','closed') 
    NOT NULL DEFAULT 'submitted'
  `);
};

export const down = async (connection) => {
  // First convert any 'closed' rows to 'completed' before shrinking ENUM
  await connection.query(`
    UPDATE maintenance_requests SET status = 'completed' WHERE status = 'closed'
  `);
  await connection.query(`
    ALTER TABLE maintenance_requests
    MODIFY COLUMN status 
    ENUM('submitted','in_progress','completed') 
    NOT NULL DEFAULT 'submitted'
  `);
};
