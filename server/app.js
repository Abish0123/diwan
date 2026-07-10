const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const pool = require('./config/database');

dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3100',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'API Server Running', database: 'MySQL Connected' });
});

// ── Routes ──────────────────────────────────────────────────────────────────

// Students API
app.use('/api/students', require('./routes/students'));

// Admissions API
app.use('/api/admissions', require('./routes/admissions'));

// Attendance API
app.use('/api/attendance', require('./routes/attendance'));

// Health Records API
app.use('/api/health', require('./routes/health'));

// Behavior/Incidents API
app.use('/api/incidents', require('./routes/incidents'));

// Exit Records API
app.use('/api/exit-records', require('./routes/exitRecords'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    details: process.env.NODE_ENV === 'development' ? err : {},
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📱 Frontend: http://localhost:3100`);
});

module.exports = app;
