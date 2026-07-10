const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Get all leads
router.get('/', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.query(
      `SELECT * FROM leads ORDER BY createdAt DESC`
    );
    conn.release();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create lead
router.post('/', async (req, res) => {
  try {
    const { studentName, parentName, phone, email, interestedClass, source, notes, status } = req.body;
    const conn = await pool.getConnection();

    const [result] = await conn.query(
      `INSERT INTO leads (studentName, parentName, phone, email, interestedClass, source, notes, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [studentName, parentName, phone, email, interestedClass, source, notes, status || 'Enquiry']
    );

    conn.release();
    res.json({ id: result.insertId, message: 'Lead created successfully' });
  } catch (err) {
    console.error('Error creating lead:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update lead status
router.put('/:id', async (req, res) => {
  try {
    const { status, studentId, allocatedGrade, allocatedSection } = req.body;
    const conn = await pool.getConnection();

    const fields = ['updatedAt = NOW()'];
    const values = [];

    if (status !== undefined) { fields.push('status = ?'); values.push(status); }
    if (studentId !== undefined) { fields.push('studentId = ?'); values.push(studentId); }
    if (allocatedGrade !== undefined) { fields.push('allocatedGrade = ?'); values.push(allocatedGrade); }
    if (allocatedSection !== undefined) { fields.push('allocatedSection = ?'); values.push(allocatedSection); }

    values.push(req.params.id);

    await conn.query(`UPDATE leads SET ${fields.join(', ')} WHERE id = ?`, values);
    conn.release();
    res.json({ message: 'Lead updated successfully' });
  } catch (err) {
    console.error('Error updating lead:', err);
    res.status(500).json({ error: err.message });
  }
});

// Enroll lead (create student record)
router.post('/:id/enroll', async (req, res) => {
  try {
    const leadId = req.params.id;
    const conn = await pool.getConnection();

    // Get lead details
    const [leads] = await conn.query('SELECT * FROM leads WHERE id = ?', [leadId]);
    if (leads.length === 0) {
      conn.release();
      return res.status(404).json({ error: 'Lead not found' });
    }

    const lead = leads[0];
    const studentId = `STD-${Math.floor(1000 + Math.random() * 9000)}`;

    // Create student record
    await conn.query(
      `INSERT INTO students (id, name, classId, status, email, qidNumber, admissionDate, attendance, feeStatus, performance, riskScore, parentEngagement)
       VALUES (?, ?, ?, 'Active', ?, '', NOW(), 85, 'Pending', 'Good', 50, 'Medium')`,
      [studentId, lead.studentName, lead.interestedClass || 'Grade 1', lead.email]
    );

    // Update lead status
    await conn.query(
      'UPDATE leads SET status = ?, studentId = ?, updatedAt = NOW() WHERE id = ?',
      ['Enrolled', studentId, leadId]
    );

    conn.release();
    res.json({ studentId, message: 'Student enrolled successfully' });
  } catch (err) {
    console.error('Error enrolling lead:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
