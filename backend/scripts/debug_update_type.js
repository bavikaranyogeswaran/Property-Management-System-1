import db from '../config/db.js';
import propertyModel from '../models/propertyModel.js';

async function testUpdate() {
    try {
        console.log('Fetching property types...');
        const types = await propertyModel.getTypes();
        console.table(types);

        if (types.length < 2) {
            console.log('Not enough types to test switching.');
            process.exit(0);
        }

        const typeA = types[0].type_id;
        const typeB = types[1].type_id;

        console.log(`Testing switching property 1 between type ${typeA} and ${typeB}`);

        // Get current
        let prop = await propertyModel.findById(1);
        if (!prop) {
            console.log('Property 1 not found. Creating a dummy one requires owner...');
            process.exit(1);
        }
        console.log('Current type:', prop.type_id);

        const newType = (prop.type_id === typeA) ? typeB : typeA;
        console.log(`Updating to type ${newType}...`);

        const success = await propertyModel.update(1, { propertyTypeId: newType });
        console.log('Update result:', success);

        // Verify
        prop = await propertyModel.findById(1);
        console.log('New type:', prop.type_id);

        if (prop.type_id === newType) {
            console.log('SUCCESS: Property type updated correctly.');
        } else {
            console.error('FAILURE: Property type did NOT update.');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

testUpdate();
