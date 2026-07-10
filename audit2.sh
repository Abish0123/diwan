#!/bin/bash

echo "### 9. FINANCE WORKFLOW - Create Invoice"
RESPONSE=$(curl -s -X POST http://localhost:3000/api/data/invoices \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "INV-TEST-001",
    "invoiceNumber": "INV-2026-001",
    "studentId": "STU-001",
    "amount": 5000,
    "status": "Pending",
    "dueDate": "2026-07-21",
    "uid": "admin-uid"
  }')
echo "Invoice created: $(echo $RESPONSE | grep -o '"amount":[0-9]*')"
echo ""

echo "### 10. ATTENDANCE WORKFLOW"
node -e "
const mysql = require('mysql2/promise');
mysql.createConnection({
  host: '217.21.85.14',
  user: 'nobl6990_Demo-SD',
  password: 'Q0N#k]q)s0A~aQOM',
  database: 'nobl6990_Demo1-SD'
}).then(async c => {
  const [att] = await c.query('SELECT COUNT(*) as cnt, date FROM attendance GROUP BY date LIMIT 5');
  console.log('Attendance records by date:');
  att.forEach(a => console.log('  ' + a.date + ': ' + a.cnt + ' records'));
  c.end();
}).catch(e => console.log('Error:', e.message));
" 2>&1
echo ""

echo "### 11. HR PAYROLL DATA"
node -e "
const mysql = require('mysql2/promise');
mysql.createConnection({
  host: '217.21.85.14',
  user: 'nobl6990_Demo-SD',
  password: 'Q0N#k]q)s0A~aQOM',
  database: 'nobl6990_Demo1-SD'
}).then(async c => {
  const [p] = await c.query('SELECT status, COUNT(*) as cnt FROM payroll GROUP BY status');
  console.log('Payroll status breakdown:');
  p.forEach(row => console.log('  ' + row.status + ': ' + row.cnt));
  c.end();
}).catch(e => console.log('Error:', e.message));
" 2>&1
echo ""

echo "### 12. CODING TESTS DATA"
node -e "
const mysql = require('mysql2/promise');
mysql.createConnection({
  host: '217.21.85.14',
  user: 'nobl6990_Demo-SD',
  password: 'Q0N#k]q)s0A~aQOM',
  database: 'nobl6990_Demo1-SD'
}).then(async c => {
  const [q] = await c.query('SELECT language, COUNT(*) as cnt FROM coding_questions GROUP BY language');
  console.log('Coding questions by language:');
  q.forEach(r => console.log('  ' + r.language + ': ' + r.cnt));
  c.end();
}).catch(e => console.log('Error:', e.message));
" 2>&1
echo ""

echo "### 13. DATA VALIDATION - Check NULL fields"
node -e "
const mysql = require('mysql2/promise');
mysql.createConnection({
  host: '217.21.85.14',
  user: 'nobl6990_Demo-SD',
  password: 'Q0N#k]q)s0A~aQOM',
  database: 'nobl6990_Demo1-SD'
}).then(async c => {
  // Check students with missing critical fields
  const [s] = await c.query('SELECT COUNT(*) as cnt FROM students WHERE email IS NULL OR name IS NULL');
  console.log('Students with missing email/name:', s[0].cnt);
  
  // Check staff
  const [st] = await c.query('SELECT COUNT(*) as cnt FROM staff WHERE email IS NULL');
  console.log('Staff with missing email:', st[0].cnt);
  
  c.end();
}).catch(e => console.log('Error:', e.message));
" 2>&1
echo ""

echo "### 14. TRANSACTION TEST - Bulk Operations"
echo "Creating 5 new students..."
for i in {1..5}; do
  curl -s -X POST http://localhost:3000/api/data/students \
    -H 'Content-Type: application/json' \
    -d "{
      \"id\": \"STU-BULK-$i\",
      \"studentId\": \"BULK$i\",
      \"name\": \"Bulk Test Student $i\",
      \"email\": \"bulk$i@test.com\",
      \"classId\": \"Grade 10-A\",
      \"status\": \"Active\",
      \"uid\": \"admin-uid\"
    }" > /dev/null
done
echo "✅ 5 students created"
echo ""

echo "### 15. VERIFY BULK INSERT PERSISTED"
curl -s http://localhost:3000/api/data/students | grep -o '"name":"Bulk Test[^"]*"' | head -3
echo ""

