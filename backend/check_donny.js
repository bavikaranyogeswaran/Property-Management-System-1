import db from './config/db.js';

async function checkDonny() {
    try {
        const email = 'bavikaran4@gmail.com';
        console.log(`Checking data for ${email}...`);

        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        console.log('User Record:', users);

        const [leads] = await db.query('SELECT * FROM leads WHERE email = ?', [email]);
        console.log('Lead Record:', leads);

        // Also check if there's any tenant profile
        if (users.length > 0) {
            const [profiles] = await db.query('SELECT * FROM tenant_profile WHERE tenant_id = ?', [users[0].user_id]);
            console.log('Tenant Profile:', profiles);
        }

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

checkDonny();
