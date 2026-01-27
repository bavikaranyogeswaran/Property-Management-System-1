
import jwt from 'jsonwebtoken';
import { Blob } from 'buffer';

const JWT_SECRET = 'your_super_secret_key_change_this';
const token = jwt.sign(
    { id: 1, role: 'owner', name: 'Owner', email: 'bavikaran01@gmail.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
);

async function testImageUpload() {
    try {
        // 1. Fetch a valid unit
        const unitsRes = await fetch('http://localhost:3000/api/units', { headers: { 'Authorization': `Bearer ${token}` } });
        const units = await unitsRes.json();
        if (units.length === 0) { console.log('No units found'); return; }
        const unitId = units[0].id; // or unit_id
        console.log(`Using Unit ID: ${unitId}`);

        // 2. Upload Image
        const formData = new FormData();
        const blob = new Blob(['fake image content'], { type: 'image/png' });
        formData.append('images', blob, 'test_image.png');

        const res = await fetch(`http://localhost:3000/api/units/${unitId}/images`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        console.log('Upload Status:', res.status);
        if (res.ok) {
            console.log('Success:', await res.json());
        } else {
            console.log('Error:', await res.text());
        }

    } catch (e) {
        console.error(e);
    }
}

testImageUpload();
