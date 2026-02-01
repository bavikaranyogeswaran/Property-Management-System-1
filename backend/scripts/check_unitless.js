import db from '../config/db.js';

async function checkUnitless() {
    try {
        const [properties] = await db.query("SELECT property_id, name FROM properties");
        const [units] = await db.query("SELECT * FROM units");

        const propertyIdsWithUnits = new Set(units.map(u => u.property_id));
        const unitlessProperties = properties.filter(p => !propertyIdsWithUnits.has(p.property_id));

        console.log(`Found ${properties.length} properties and ${units.length} units.`);

        console.log("Unitless Properties:");
        if (unitlessProperties.length === 0) {
            console.log("None found. All properties have units.");
            console.log("Dumping properties and their unit counts/rents:");

            // Map units to properties
            const unitsByProp = {};
            units.forEach(u => {
                if (!unitsByProp[u.property_id]) unitsByProp[u.property_id] = [];
                unitsByProp[u.property_id].push(u);
            });

            properties.forEach(p => {
                const propUnits = unitsByProp[p.property_id] || [];
                console.log(`\nProperty: ${p.name} (ID: ${p.property_id})`);
                console.log(`  - Total Units: ${propUnits.length}`);
                propUnits.forEach(u => {
                    console.log(`    - Unit ${u.unit_number}: Rent=${u.monthly_rent}, Status=${u.status}`);
                });
            });

        } else {
            unitlessProperties.forEach(p => console.log(`- ${p.name} (ID: ${p.property_id})`));
        }

        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

checkUnitless();
