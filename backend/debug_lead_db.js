
import db from './config/db.js';

async function checkLead() {
    try {
        const email = 'freakone06@gmail.com';
        console.log(`Searching for lead with email: '${email}'`);

        const [rows] = await db.query('SELECT * FROM leads');

        console.log(`Total leads found: ${rows.length}`);

        const match = rows.find(r => r.email.trim().toLowerCase() === email.trim().toLowerCase());

        if (match) {
            console.log('Match FOUND!');
            console.log(match);
            console.log(`Status: '${match.status}'`);
            console.log(`Email (raw): '${match.email}'`);
        } else {
            console.log('No match found.');
            console.log('Dumping allemails:');
            rows.forEach(r => console.log(`'${r.email}' (${r.status})`));
        }

    } catch (error) {
        console.error(error);
    } finally {
        process.exit();
    }
}

checkLead();
