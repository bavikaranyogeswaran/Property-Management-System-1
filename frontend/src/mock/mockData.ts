// Mock data for frontend development
// This will be used until the backend is ready

export const mockData = {
    users: [
        {
            id: '1',
            email: 'owner@test.com',
            name: 'John Owner',
            role: 'owner' as const,
        },
        {
            id: '2',
            email: 'tenant@test.com',
            name: 'Jane Tenant',
            role: 'tenant' as const,
        },
        {
            id: '3',
            email: 'treasurer@test.com',
            name: 'Bob Treasurer',
            role: 'treasurer' as const,
        },
    ],

    properties: [
        {
            id: '1',
            ownerId: '1',
            name: 'Sunset Apartments',
            address: '123 Main St, City, State',
            type: 'Apartment Complex',
            totalUnits: 10,
        },
        {
            id: '2',
            ownerId: '1',
            name: 'Green Valley Homes',
            address: '456 Oak Ave, City, State',
            type: 'Residential',
            totalUnits: 5,
        },
    ],

    units: [
        {
            id: '1',
            propertyId: '1',
            unitNumber: 'A101',
            type: '2 Bedroom',
            bedrooms: 2,
            bathrooms: 1,
            rent: 1200,
            status: 'occupied' as const,
        },
        {
            id: '2',
            propertyId: '1',
            unitNumber: 'A102',
            type: '1 Bedroom',
            bedrooms: 1,
            bathrooms: 1,
            rent: 900,
            status: 'vacant' as const,
        },
    ],

    leads: [
        {
            id: '1',
            name: 'Alice Johnson',
            email: 'alice@email.com',
            phone: '555-0101',
            status: 'new' as const,
            source: 'Website',
            createdAt: '2026-01-15T10:00:00Z',
        },
        {
            id: '2',
            name: 'Bob Smith',
            email: 'bob@email.com',
            phone: '555-0102',
            status: 'contacted' as const,
            source: 'Referral',
            createdAt: '2026-01-14T14:30:00Z',
        },
    ],

    maintenanceRequests: [
        {
            id: '1',
            unitId: '1',
            tenantId: '2',
            title: 'Leaking faucet',
            description: 'Kitchen faucet is dripping',
            priority: 'medium' as const,
            status: 'open' as const,
            createdAt: '2026-01-18T09:00:00Z',
        },
    ],
};

export default mockData;
