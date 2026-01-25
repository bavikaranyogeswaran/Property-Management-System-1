import db from './config/db.js';
import propertyModel from './models/propertyModel.js';

async function testPropertyCreation() {
    try {
        console.log('Testing DB Connection...');
        const [types] = await db.query('SELECT * FROM property_types');
        console.log('Property Types:', types);

        if (types.length === 0) {
            console.log('No property types found. Seeding...');
            await db.query(`INSERT INTO property_types (name, description) VALUES 
                ('Apartment', 'Residential apartment'),
                ('House', 'Residential house'),
                ('Commercial', 'Commercial space')`);
            console.log('Seeded property types.');
        }

        // Mock owner ID - ensure this user exists!
        // We'll check users first.
        const [users] = await db.query('SELECT user_id, role FROM users WHERE role="owner" LIMIT 1');
        if (users.length === 0) {
            console.error('No owner user found. Cannot test property creation.');
            return;
        }
        const ownerId = users[0].user_id;

        const TestData = {
            ownerId: ownerId,
            name: 'Test Property Debug',
            propertyTypeId: types.length > 0 ? types[0].type_id : 1,
            addressLine1: '123 Debug St',
            addressLine2: '',
            addressLine3: '',
            imageUrl: '/test.jpg'
        };

        console.log('Attempting to create property with:', TestData);
        const result = await propertyModel.create(TestData);
        console.log('Property Created Successfully! ID:', result);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

testPropertyCreation();
