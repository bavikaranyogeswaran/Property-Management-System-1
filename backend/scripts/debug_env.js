
import 'dotenv/config';

console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD length:', process.env.DB_PASSWORD ? process.env.DB_PASSWORD.length : 0);
console.log('DB_PASSWORD first 4:', process.env.DB_PASSWORD ? process.env.DB_PASSWORD.substring(0, 4) : 'N/A');
console.log('DB_PASSWORD contains #:', process.env.DB_PASSWORD ? process.env.DB_PASSWORD.includes('#') : false);
