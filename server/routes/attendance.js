const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Get attendance records
router.get('/', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.query('SELECT * FROM attendance ORDER BY date DESC');
    conn.release();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create attendance record
router.post('/', async (req, res) => {
  try {
    const { studentId, date, status } = req.body;
    const conn = await pool.getConnection();

    await conn.query(
      'INSERT INTO attendance (studentId, date, status, createdAt) VALUES (?, ?, ?, NOW())',
      [studentId, date, status]
    );

    conn.release();
    res.json({ message: 'Attendance recorded' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
