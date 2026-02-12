import db from '../config/db.js';
import bcrypt from 'bcryptjs';

const ownerDetails = {
  id: 1, // User requested ID 1
  name: 'Bavikaran Yogeswaran',
  email: 'bavikaran01@gmail.com',
  password: 'owner123',
  phone: '0778947667',
  nic: '198533001234',
  tin: '100200300',
  bank_name: 'Sampath Bank PLC',
  branch_name: 'Colombo 04 (Bambalapitiya)',
  account_holder_name: 'Y. Bavikaran',
  account_number: '002930012845',
  residence_address: 'Colombo, Sri Lanka', // Defaulting as not provided, or optional
};

async function createOwner() {
  try {
    console.log(`Checking if user ${ownerDetails.email} exists...`);
    const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [
      ownerDetails.email,
    ]);

    let userId;

    if (existing.length > 0) {
      userId = existing[0].user_id;
      console.log(
        `User ${ownerDetails.email} already exists (ID: ${userId}). Proceeding to create/update Owner profile.`
      );
    } else {
      console.log('Hashing password...');
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(ownerDetails.password, salt);

      console.log('Creating User record...');
      try {
        const [userResult] = await db.query(
          `INSERT INTO users (user_id, name, email, phone, password_hash, role, status, is_email_verified) 
                     VALUES (?, ?, ?, ?, ?, 'owner', 'active', 1)`,
          [
            ownerDetails.id,
            ownerDetails.name,
            ownerDetails.email,
            ownerDetails.phone,
            passwordHash,
          ]
        );
        userId = ownerDetails.id;
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          console.log(`ID ${ownerDetails.id} taken. Using auto-increment...`);
          const [userResultAuto] = await db.query(
            `INSERT INTO users (name, email, phone, password_hash, role, status, is_email_verified) 
                         VALUES (?, ?, ?, ?, 'owner', 'active', 1)`,
            [
              ownerDetails.name,
              ownerDetails.email,
              ownerDetails.phone,
              passwordHash,
            ]
          );
          userId = userResultAuto.insertId;
        } else {
          throw err;
        }
      }
      console.log(`User created with ID: ${userId}.`);
    }

    console.log('Creating Owner profile...');
    // Check if owner record exists first to avoid duplicate error
    const [existingOwner] = await db.query(
      'SELECT * FROM owners WHERE user_id = ?',
      [userId]
    );

    if (existingOwner.length > 0) {
      console.log('Owner profile already exists. Updating details...');
      await db.query(
        `UPDATE owners SET nic=?, tin=?, bank_name=?, branch_name=?, account_holder_name=?, account_number=? WHERE user_id=?`,
        [
          ownerDetails.nic,
          ownerDetails.tin,
          ownerDetails.bank_name,
          ownerDetails.branch_name,
          ownerDetails.account_holder_name,
          ownerDetails.account_number,
          userId,
        ]
      );
    } else {
      await db.query(
        `INSERT INTO owners (user_id, nic, tin, bank_name, branch_name, account_holder_name, account_number)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          ownerDetails.nic,
          ownerDetails.tin,
          ownerDetails.bank_name,
          ownerDetails.branch_name,
          ownerDetails.account_holder_name,
          ownerDetails.account_number,
        ]
      );
    }

    console.log('Owner setup complete successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error creating owner:', error);
    process.exit(1);
  }
}

createOwner();
