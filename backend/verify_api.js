import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const API_BASE_URL = 'http://localhost:3000/api';

async function verifyApi() {
    try {
        console.log("--- VERIFY API START ---");

        // 1. Create a Token for Owner ID 1
        // Payload matching what authController uses (usually { id: user.id, role: user.role })
        // Checking authController login or middleware verification...
        // Middleware: verify(token, ...) -> req.user = decoded.
        // So payload should contain id and role.

        const token = jwt.sign(
            { id: 1, role: 'owner', email: 'bavikaran01@gmail.com' },
            JWT_SECRET,
            { expiresIn: '1h' }
        );
        console.log("Generated Test Token:", token.substring(0, 20) + "...");

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        // 2. Test GET /api/leads
        console.log("\n--- Testing GET /api/leads ---");
        const leadsRes = await fetch(`${API_BASE_URL}/leads`, { headers });
        console.log(`Status: ${leadsRes.status}`);
        if (leadsRes.ok) {
            const leads = await leadsRes.json();
            console.log(`Leads Count: ${leads.length}`);
            console.log(JSON.stringify(leads, null, 2));
        } else {
            const err = await leadsRes.text();
            console.log("Error:", err);
        }

        // 3. Test GET /api/users/tenants
        console.log("\n--- Testing GET /api/users/tenants ---");
        const tenantsRes = await fetch(`${API_BASE_URL}/users/tenants`, { headers });
        console.log(`Status: ${tenantsRes.status}`);
        if (tenantsRes.ok) {
            const tenants = await tenantsRes.json();
            console.log(`Tenants Count: ${tenants.length}`);
            console.log(JSON.stringify(tenants, null, 2));
        } else {
            const err = await tenantsRes.text();
            console.log("Error:", err);
        }

    } catch (err) {
        console.error("Script Error:", err);
    }
}

verifyApi();
