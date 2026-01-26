import propertyModel from '../models/propertyModel.js';

async function verifyProperties() {
    try {
        console.log('Fetching properties...');
        const props = await propertyModel.findAll();
        console.log(`Found ${props.length} properties.`);
        if (props.length > 0) {
            console.log('First property:', props[0]);
            if (props[0].type_name) {
                console.log('SUCCESS: type_name is present (fetched via JOIN).');
            } else {
                console.error('FAILURE: type_name is MISSING.');
            }
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

verifyProperties();
