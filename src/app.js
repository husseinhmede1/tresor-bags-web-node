const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const bagRoutes = require('./routes/bagRoutes');
const collectionRoutes = require('./routes/collectionRoutes');
const typeRoutes = require('./routes/typeRoutes');
const orderRoutes = require('./routes/orderRoutes');
const statsRoutes = require('./routes/statsRoutes');
const aiRoutes = require('./routes/aiRoutes');
const migrateImages = require('./utils/migrateImages');
const catalogIndex = require('./utils/catalogIndex');
dotenv.config();
// Move old base64 images first, then (re)build the assistant's search index.
connectDB().then(migrateImages).then(() => catalogIndex.reindex()).catch(e => console.warn('Startup jobs:', e.message));

const app = express();
// Render sits behind a proxy; needed so req.ip is the real client IP.
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/api/bags', bagRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/types', typeRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/ai', aiRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Tresor Bags API is running 🚀' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));