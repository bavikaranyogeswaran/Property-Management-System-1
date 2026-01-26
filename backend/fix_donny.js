import db from './config/db.js';

async function checkAndFixDonny() {
    try {
        const email = 'bavikaran4@gmail.com';
        console.log(`Checking data for ${email}...`);

        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        console.log('User Record:', users);

        if (users.length > 0) {
            const userId = users[0].user_id;
            const [profiles] = await db.query('SELECT * FROM tenant_profile WHERE tenant_id = ?', [userId]);
            console.log('Tenant Profile:', profiles);

            if (profiles.length === 0) {
                console.log('Fixing missing tenant_profile for Donny...');
                await db.query('INSERT INTO tenant_profile (tenant_id, phone) VALUES (?, ?)', [userId, users[0].phone]);
                console.log('Fixed: tenant_profile created.');
            }
        } else {
            console.log('User not found.');
        }

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

checkAndFixDonny();
