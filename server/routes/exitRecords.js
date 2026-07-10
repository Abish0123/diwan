const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Get exit records
router.get('/', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.query('SELECT * FROM exitRecords ORDER BY exitDate DESC');
    conn.release();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create exit record
router.post('/', async (req, res) => {
  try {
    const {
      studentId, studentName, classId, qidNumber, exitDate, exitReason,
      destinationSchool, destinationCountry, tcNumber, feesClearance,
      libraryClearance, transportClearance, exitRemarks, parentAcknowledgement
    } = req.body;

    const conn = await pool.getConnection();

    const [result] = await conn.query(
      `INSERT INTO exitRecords (
        studentId, studentName, classId, qidNumber, exitDate, exitReason,
        destinationSchool, destinationCountry, tcNumber, feesClearance,
        libraryClearance, transportClearance, exitRemarks, parentAcknowledgement, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        studentId, studentName, classId, qidNumber, exitDate, exitReason,
        destinationSchool, destinationCountry, tcNumber, feesClearance,
        libraryClearance, transportClearance, exitRemarks, parentAcknowledgement ? 1 : 0
      ]
    );

    conn.release();
    res.json({ id: result.insertId, tcNumber, message: 'Exit record created' });
  } catch (err) {
    console.error('Error creating exit record:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
