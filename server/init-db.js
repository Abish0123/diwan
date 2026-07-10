const mysql = require('mysql2/promise');
require('dotenv').config();

async function initializeDatabase() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT || 3306,
  });

  try {
    console.log('📋 Initializing database tables...');

    // Students table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS students (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        classId VARCHAR(50),
        status VARCHAR(50) DEFAULT 'Active',
        email VARCHAR(255),
        qidNumber VARCHAR(20),
        gender VARCHAR(20),
        nationality VARCHAR(100),
        dateOfBirth DATE,
        admissionDate DATE,
        attendance INT DEFAULT 85,
        feeStatus VARCHAR(50) DEFAULT 'Pending',
        performance VARCHAR(50) DEFAULT 'Good',
        riskScore INT DEFAULT 50,
        parentEngagement VARCHAR(50) DEFAULT 'Medium',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_classId (classId),
        INDEX idx_status (status)
      )
    `);

    // Leads table (for admissions)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS leads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        studentName VARCHAR(255) NOT NULL,
        parentName VARCHAR(255),
        phone VARCHAR(20),
        email VARCHAR(255),
        interestedClass VARCHAR(50),
        source VARCHAR(100),
        notes LONGTEXT,
        status VARCHAR(50) DEFAULT 'Enquiry',
        studentId VARCHAR(50),
        allocatedGrade VARCHAR(50),
        allocatedSection VARCHAR(50),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_status (status),
        INDEX idx_studentId (studentId)
      )
    `);

    // Attendance table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS attendance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        studentId VARCHAR(50) NOT NULL,
        date DATE,
        status VARCHAR(20),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_studentId (studentId),
        INDEX idx_date (date)
      )
    `);

    // Health Records table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS healthRecords (
        id INT AUTO_INCREMENT PRIMARY KEY,
        studentId VARCHAR(50) NOT NULL,
        healthStatus VARCHAR(100),
        height DECIMAL(5,2),
        weight DECIMAL(5,2),
        bloodType VARCHAR(5),
        allergies LONGTEXT,
        medicalHistory LONGTEXT,
        date DATE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_studentId (studentId)
      )
    `);

    // Behavior Incidents table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS behaviorIncidents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        studentId VARCHAR(50) NOT NULL,
        incidentType VARCHAR(100),
        description LONGTEXT,
        date DATE,
        severity VARCHAR(50),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_studentId (studentId),
        INDEX idx_date (date)
      )
    `);

    // Exit Records table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS exitRecords (
        id INT AUTO_INCREMENT PRIMARY KEY,
        studentId VARCHAR(50),
        studentName VARCHAR(255),
        classId VARCHAR(50),
        qidNumber VARCHAR(20),
        exitDate DATE,
        exitReason VARCHAR(100),
        destinationSchool VARCHAR(255),
        destinationCountry VARCHAR(100),
        tcNumber VARCHAR(50),
        feesClearance VARCHAR(50),
        libraryClearance VARCHAR(50),
        transportClearance VARCHAR(50),
        exitRemarks LONGTEXT,
        parentAcknowledgement BOOLEAN DEFAULT FALSE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_studentId (studentId),
        INDEX idx_tcNumber (tcNumber)
      )
    `);

    console.log('✅ Database tables created successfully!');
    console.log('\nTables created:');
    console.log('  ✓ students');
    console.log('  ✓ leads');
    console.log('  ✓ attendance');
    console.log('  ✓ healthRecords');
    console.log('  ✓ behaviorIncidents');
    console.log('  ✓ exitRecords');

  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
  } finally {
    await conn.end();
  }
}

initializeDatabase();
