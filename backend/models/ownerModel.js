import pool from '../config/db.js';

class OwnerModel {
    async create(ownerData, connection) {
        const {
            userId, nic, tin,
            bankName, branchName, accountHolderName, accountNumber,
            residenceAddress
        } = ownerData;

        // Uses the provided connection for transaction support
        const query = `
            INSERT INTO owners 
            (user_id, nic, tin, bank_name, branch_name, account_holder_name, account_number, residence_address) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await connection.query(query, [
            userId, nic, tin,
            bankName, branchName, accountHolderName, accountNumber,
            residenceAddress
        ]);

        return userId;
    }

    async findByUserId(userId) {
        const [rows] = await pool.query('SELECT * FROM owners WHERE user_id = ?', [userId]);
        return rows[0];
    }
}

export default new OwnerModel();
