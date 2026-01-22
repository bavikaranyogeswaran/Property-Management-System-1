import pool from '../config/db';
import { compare, hash } from 'bcryptjs';
import { sign } from 'jsonwebtoken';

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

class AuthService {
    // Universal Login (Rule 4)
    async login(email, password) {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ? AND status = "active"', [email]);

        if (rows.length === 0) {
            throw new Error('Invalid credentials');
        }

        const user = rows[0];
        const isValid = await compare(password, user.password_hash);

        if (!isValid) {
            throw new Error('Invalid credentials');
        }

        const token = sign(
            { id: user.user_id, role: user.role, name: user.name },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        return {
            token,
            user: {
                id: user.user_id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        };
    }

    // Register Owner (Rule 1: Only one owner allowed)
    async registerOwner(name, email, password) {
        // Check if owner already exists
        const [existingOwners] = await pool.query('SELECT COUNT(*) as count FROM users WHERE role = "owner"');
        if (existingOwners[0].count > 0) {
            throw new Error('Owner already registered. Only one owner is allowed.');
        }

        // Check if email is taken
        const [existingEmail] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existingEmail.length > 0) {
            throw new Error('Email already in use.');
        }

        const hashedPassword = await hash(password, SALT_ROUNDS);

        const [result] = await pool.query(
            'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, "owner")',
            [name, email, hashedPassword]
        );

        return { id: result.insertId, name, email, role: 'owner' };
    }

    // Create Treasurer (Rule 2: Only by Owner)
    // Note: The controller must verify the requester is an owner before calling this
    async createTreasurer(name, email, password) {
        const [existingEmail] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existingEmail.length > 0) {
            throw new Error('Email already in use.');
        }

        const hashedPassword = await hash(password, SALT_ROUNDS);

        const [result] = await pool.query(
            'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, "treasurer")',
            [name, email, hashedPassword]
        );

        return { id: result.insertId, name, email, role: 'treasurer' };
    }
}

export default new AuthService();
