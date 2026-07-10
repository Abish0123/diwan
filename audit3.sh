#!/bin/bash

echo "### 16. DATA COMPLETENESS CHECK"
node -e "
const mysql = require('mysql2/promise');
mysql.createConnection({
  host: '217.21.85.14',
  user: 'nobl6990_Demo-SD',
  password: 'Q0N#k]q)s0A~aQOM',
  database: 'nobl6990_Demo1-SD'
}).then(async c => {
  // Get sample records to check data completeness
  const [students] = await c.query('SELECT data FROM students LIMIT 10');
  
  const requiredFields = ['id', 'name', 'email', 'classId', 'status'];
  let missingCount = 0;
  
  students.forEach(s => {
    const data = JSON.parse(s.data);
    requiredFields.forEach(field => {
      if (!data[field] && data[field] !== false && data[field] !== 0) {
        missingCount++;
      }
    });
  });
  
  console.log('Students checked: 10');
  console.log('Missing required fields: ' + missingCount);
  
  c.end();
}).catch(e => console.log('Error:', e.message));
" 2>&1
echo ""

echo "### 17. CHECK ATTENDANCE DATA INTEGRITY"
node -e "
const mysql = require('mysql2/promise');
mysql.createConnection({
  host: '217.21.85.14',
  user: 'nobl6990_Demo-SD',
  password: 'Q0N#k]q)s0A~aQOM',
  database: 'nobl6990_Demo1-SD'
}).then(async c => {
  const [att] = await c.query('SELECT data FROM attendance LIMIT 20');
  const dates = {};
  att.forEach(a => {
    const d = JSON.parse(a.data);
    const date = d.date || 'null';
    dates[date] = (dates[date] || 0) + 1;
  });
  console.log('Attendance by date:');
  Object.entries(dates).forEach(([date, count]) => {
    console.log('  ' + date + ': ' + count);
  });
  c.end();
}).catch(e => console.log('Error:', e.message));
" 2>&1
echo ""

echo "### 18. CODING ASSESSMENT DATA"
node -e "
const mysql = require('mysql2/promise');
mysql.createConnection({
  host: '217.21.85.14',
  user: 'nobl6990_Demo-SD',
  password: 'Q0N#k]q)s0A~aQOM',
  database: 'nobl6990_Demo1-SD'
}).then(async c => {
  const [tests] = await c.query('SELECT data FROM coding_tests LIMIT 5');
  tests.forEach((t, i) => {
    const d = JSON.parse(t.data);
    console.log((i+1) + '. ' + (d.title || 'Untitled') + ' (' + (d.duration || '?') + ' min)');
  });
  c.end();
}).catch(e => console.log('Error:', e.message));
" 2>&1
echo ""

echo "### 19. LIBRARY BOOKS DATA"
node -e "
const mysql = require('mysql2/promise');
mysql.createConnection({
  host: '217.21.85.14',
  user: 'nobl6990_Demo-SD',
  password: 'Q0N#k]q)s0A~aQOM',
  database: 'nobl6990_Demo1-SD'
}).then(async c => {
  const [books] = await c.query('SELECT COUNT(*) as cnt FROM library');
  console.log('Library books: ' + books[0].cnt);
  
  const [sample] = await c.query('SELECT data FROM library LIMIT 3');
  console.log('Sample books:');
  sample.forEach((b, i) => {
    const d = JSON.parse(b.data);
    console.log('  ' + (i+1) + '. ' + d.title + ' (ISBN: ' + d.isbn + ')');
  });
  c.end();
}).catch(e => console.log('Error:', e.message));
" 2>&1
echo ""

echo "### 20. TRANSPORT DATA"
node -e "
const mysql = require('mysql2/promise');
mysql.createConnection({
  host: '217.21.85.14',
  user: 'nobl6990_Demo-SD',
  password: 'Q0N#k]q)s0A~aQOM',
  database: 'nobl6990_Demo1-SD'
}).then(async c => {
  const [routes] = await c.query('SELECT data FROM transport_routes');
  const [vehicles] = await c.query('SELECT data FROM transport_vehicles');
  
  console.log('Routes: ' + routes.length);
  console.log('Vehicles: ' + vehicles.length);
  
  if (vehicles.length > 0) {
    const v = JSON.parse(vehicles[0].data);
    console.log('Sample vehicle: ' + v.vehicleNumber + ' (' + v.model + ')');
  }
  
  c.end();
}).catch(e => console.log('Error:', e.message));
" 2>&1
echo ""

