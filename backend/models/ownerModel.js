// ============================================================================
//  OWNER MODEL (The Investor Registry)
// ============================================================================
//  Manages specific details for property investors.
// ============================================================================

import pool from '../config/db.js';

class OwnerModel {
  // CREATE: Establishes the investment profile for a user, including financial and tax metadata.
  async create(ownerData, connection) {
    const {
      userId,
      nic,
      tin,
      bankName,
      branchName,
      accountHolderName,
      accountNumber,
      tin_url,
    } = ownerData;

    // 1. [VALIDATION] ID Verification: Ensures legal identification (NIC) is provided
    if (!nic) {
      const error = new Error('NIC is required for creating an owner profile.');
      error.status = 400;
      throw error;
    }

    // 2. [DATA] Persistence: Insert financial vault data using the provided transaction connection
    const query = `
            INSERT INTO owners 
            (user_id, nic, tin, tin_url, bank_name, branch_name, account_holder_name, account_number) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

    await connection.query(query, [
      userId,
      nic,
      tin,
      tin_url || null,
      bankName,
      branchName,
      accountHolderName,
      accountNumber,
    ]);

    return userId;
  }

  // FIND BY USER ID: Fetches the investor's bank and tax profile.
  async findByUserId(userId) {
    // 1. [QUERY] Direct Retrieval
    const [rows] = await pool.query('SELECT * FROM owners WHERE user_id = ?', [
      userId,
    ]);
    const row = rows[0];
    if (!row) return null;

    // 2. [TRANSFORMATION] DTO Mapping
    return {
      userId: row.user_id,
      nic: row.nic,
      tin: row.tin,
      bankName: row.bank_name,
      branchName: row.branch_name,
      accountHolderName: row.account_holder_name,
      accountNumber: row.account_number,
      tinUrl: row.tin_url,
    };
  }
}

export default new OwnerModel();
