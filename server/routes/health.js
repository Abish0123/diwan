const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Get health records
router.get('/', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.query('SELECT * FROM healthRecords ORDER BY date DESC');
    conn.release();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create health record
router.post('/', async (req, res) => {
  try {
    const { studentId, healthStatus, height, weight, bloodType, allergies, medicalHistory } = req.body;
    const conn = await pool.getConnection();

    await conn.query(
      `INSERT INTO healthRecords (studentId, healthStatus, height, weight, bloodType, allergies, medicalHistory, date, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [studentId, healthStatus, height, weight, bloodType, allergies, medicalHistory]
    );

    conn.release();
    res.json({ message: 'Health record created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
