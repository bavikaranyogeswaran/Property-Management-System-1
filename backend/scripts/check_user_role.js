
import db from '../config/db.js';

async function checkUserRole() {
    try {
        const [rows] = await db.query('SELECT user_id, name, email, role, status FROM users WHERE email = ?', ['bavikaran01@gmail.com']);
        console.log('User found:', rows);
    } catch (error) {
        console.error('Error fetching user:', error);
    } finally {
        process.exit();
    }
}

checkUserRole();
