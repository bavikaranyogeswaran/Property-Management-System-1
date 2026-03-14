
const API_URL = 'http://localhost:3000/api';

async function testPublicEndpoints() {
  console.log('Testing Public Endpoints...');
  
  const endpoints = [
    '/properties',
    '/property-types',
    '/unit-types',
    '/units',
    '/properties/1', // Example ID
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`Testing ${endpoint}...`);
      const response = await fetch(`${API_URL}${endpoint}`);
      console.log(`SUCCESS: ${endpoint} returned ${response.status}`);
    } catch (error) {
      console.log(`FAILED: ${endpoint} returned ${error.message}`);
    }
  }
}

testPublicEndpoints();
