
import leadModel from './models/leadModel.js';
import db from './config/db.js';

async function testFetch() {
    try {
        console.log("Testing leadModel.findAll(1)...");
        const leads = await leadModel.findAll(1);
        console.log("Success! Found leads:", leads);
    } catch (error) {
        console.error("CRASHED:", error);
    } finally {
        process.exit();
    }
}

testFetch();
