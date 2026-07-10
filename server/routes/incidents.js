const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Get behavior incidents
router.get('/', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.query('SELECT * FROM behaviorIncidents ORDER BY date DESC');
    conn.release();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create incident
router.post('/', async (req, res) => {
  try {
    const { studentId, incidentType, description, date, severity } = req.body;
    const conn = await pool.getConnection();

    await conn.query(
      `INSERT INTO behaviorIncidents (studentId, incidentType, description, date, severity, createdAt)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [studentId, incidentType, description, date, severity]
    );

    conn.release();
    res.json({ message: 'Incident recorded' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
