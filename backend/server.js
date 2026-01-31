import express, { json } from 'express';
import cors from 'cors';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(json());

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import leadRoutes from './routes/leadRoutes.js';
import propertyRoutes from './routes/propertyRoutes.js';
import propertyTypeRoutes from './routes/propertyTypeRoutes.js';
import unitTypeRoutes from './routes/unitTypeRoutes.js';
import unitRoutes from './routes/unitRoutes.js';
import leaseRoutes from './routes/leaseRoutes.js';
import imageRoutes from './routes/imageRoutes.js';
import maintenanceRequestRoutes from './routes/maintenanceRequestRoutes.js';
import maintenanceCostRoutes from './routes/maintenanceCostRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import receiptRoutes from './routes/receiptRoutes.js';

// ...
app.use('/api/receipts', receiptRoutes);
import behaviorRoutes from './routes/behaviorRoutes.js';

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/property-types', propertyTypeRoutes);
app.use('/api/unit-types', unitTypeRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/leases', leaseRoutes);
app.use('/api/maintenance-requests', maintenanceRequestRoutes);
app.use('/api/maintenance-costs', maintenanceCostRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/behavior', behaviorRoutes);
app.use('/api', imageRoutes);
import visitRoutes from './routes/visitRoutes.js';
app.use('/api/visits', visitRoutes);

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'PMS Backend is running' });
});

// Error Handling Middleware
// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);

    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Maximum size is 5MB.' });
    }

    if (err.message === 'Only image files are allowed') {
        return res.status(400).json({ error: err.message });
    }

    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Duplicate entry' });
    }

    res.status(500).json({ error: err.message || 'Something went wrong!' });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
