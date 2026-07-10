const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Get all students
router.get('/', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.query(
      `SELECT id, name, classId, status, email, attendance, feeStatus,
              performance, riskScore, parentEngagement, qidNumber, gender,
              nationality, dateOfBirth, admissionDate
       FROM students ORDER BY name`
    );
    conn.release();
    res.json(rows);
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get single student
router.get('/:id', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.query(
      `SELECT * FROM students WHERE id = ?`,
      [req.params.id]
    );
    conn.release();
    if (rows.length === 0) return res.status(404).json({ error: 'Student not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create student
router.post('/', async (req, res) => {
  try {
    const { name, classId, email, qidNumber, gender, nationality, dateOfBirth, admissionDate } = req.body;
    const conn = await pool.getConnection();

    const [result] = await conn.query(
      `INSERT INTO students (name, classId, status, email, qidNumber, gender, nationality, dateOfBirth, admissionDate, attendance, feeStatus, performance, riskScore, parentEngagement)
       VALUES (?, ?, 'Active', ?, ?, ?, ?, ?, ?, 85, 'Pending', 'Good', 50, 'Medium')`,
      [name, classId, email, qidNumber, gender, nationality, dateOfBirth, admissionDate]
    );

    conn.release();
    res.json({ id: result.insertId, message: 'Student created successfully' });
  } catch (err) {
    console.error('Error creating student:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update student
router.put('/:id', async (req, res) => {
  try {
    const { name, classId, status, email, attendance, feeStatus, performance, riskScore } = req.body;
    const conn = await pool.getConnection();

    const fields = [];
    const values = [];

    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (classId !== undefined) { fields.push('classId = ?'); values.push(classId); }
    if (status !== undefined) { fields.push('status = ?'); values.push(status); }
    if (email !== undefined) { fields.push('email = ?'); values.push(email); }
    if (attendance !== undefined) { fields.push('attendance = ?'); values.push(attendance); }
    if (feeStatus !== undefined) { fields.push('feeStatus = ?'); values.push(feeStatus); }
    if (performance !== undefined) { fields.push('performance = ?'); values.push(performance); }
    if (riskScore !== undefined) { fields.push('riskScore = ?'); values.push(riskScore); }

    values.push(req.params.id);

    if (fields.length > 0) {
      await conn.query(`UPDATE students SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    conn.release();
    res.json({ message: 'Student updated successfully' });
  } catch (err) {
    console.error('Error updating student:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete student
router.delete('/:id', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    await conn.query('DELETE FROM students WHERE id = ?', [req.params.id]);
    conn.release();
    res.json({ message: 'Student deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
