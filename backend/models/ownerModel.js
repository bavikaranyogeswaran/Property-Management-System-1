import pool from '../config/db.js';

class OwnerModel {
  async create(ownerData, connection) {
    const {
      userId,
      nic,
      tin,
      bankName,
      branchName,
      accountHolderName,
      accountNumber,
    } = ownerData;

    // Uses the provided connection for transaction support
    const query = `
            INSERT INTO owners 
            (user_id, nic, tin, bank_name, branch_name, account_holder_name, account_number) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

    await connection.query(query, [
      userId,
      nic,
      tin,
      bankName,
      branchName,
      accountHolderName,
      accountNumber,
    ]);

    return userId;
  }

  async findByUserId(userId) {
    const [rows] = await pool.query('SELECT * FROM owners WHERE user_id = ?', [
      userId,
    ]);
    const row = rows[0];
    if (!row) return null;
    return {
      userId: row.user_id,
      nic: row.nic,
      tin: row.tin,
      bankName: row.bank_name,
      branchName: row.branch_name,
      accountHolderName: row.account_holder_name,
      accountNumber: row.account_number,
      // residenceAddress removed from findByUserId return as strictly strictly schema doesn't seem to have it in CREATE TABLE owners above?
      // Wait, looking at schema.sql line 58...
      // CREATE TABLE owners ( user_id, nic, tin, bank_name... )
      // It does NOT have residence_address in schema.sql!
      // But OwnerModel.create tries to insert it.
      // I should remove residenceAddress from create too.
    };
  }
}

export default new OwnerModel();
