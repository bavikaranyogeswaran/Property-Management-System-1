import pool from '../config/db.js';
import bcrypt from 'bcryptjs';

const registerOwner = async () => {
    const email = 'bavikaran01@gmail.com';
    const password = 'owner123';
    const name = 'Bavikaran'; // Assuming a name, can be updated later
    const phone = '0000000000'; // Dummy phone

    try {
        // 1. Check if user already exists
        const [existingUsers] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existingUsers.length > 0) {
            console.log(`User with email ${email} already exists.`);
            process.exit(0);
        }

        // 2. Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // 3. Insert into users table
        const [userResult] = await pool.query(
            'INSERT INTO users (name, email, phone, password_hash, role, is_email_verified, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, email, phone, passwordHash, 'owner', true, 'active']
        );

        const userId = userResult.insertId;
        console.log(`Created user with ID: ${userId}`);

        // 4. Insert into owners table with dummy data
        await pool.query(
            `INSERT INTO owners 
            (user_id, nic, tin, bank_name, branch_name, account_holder_name, account_number, residence_address) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, 'Pending', 'Pending', 'Pending', 'Pending', 'Pending', 'Pending', 'Pending']
        );

        console.log('Owner registered successfully!');
        process.exit(0);

    } catch (error) {
        console.error('Error registering owner:', error);
        process.exit(1);
    }
};

registerOwner();
