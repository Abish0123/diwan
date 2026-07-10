#!/bin/bash

echo "=== FULL STACK PRODUCT AUDIT REPORT ==="
echo "Date: $(date)"
echo ""

# Test 1: API Health
echo "### 1. API HEALTH CHECK"
curl -s http://localhost:3000/api/data/students?limit=1 > /dev/null && echo "✅ API responding" || echo "❌ API down"
echo ""

# Test 2: Database Connectivity
echo "### 2. DATABASE STATUS"
node -e "
const mysql = require('mysql2/promise');
mysql.createConnection({
  host: '217.21.85.14',
  user: 'nobl6990_Demo-SD',
  password: 'Q0N#k]q)s0A~aQOM',
  database: 'nobl6990_Demo1-SD'
}).then(c => {
  console.log('✅ MySQL: Connected');
  return c.query('SELECT COUNT(*) as cnt FROM students').then(([r]) => {
    console.log('Students in DB:', r[0].cnt);
    c.end();
  });
}).catch(e => console.log('❌ MySQL:', e.message));
" 2>&1
echo ""

# Test 3: All Module Data Counts
echo "### 3. MAJOR MODULE DATA STATUS"
node -e "
const mysql = require('mysql2/promise');
const tables = ['students', 'staff', 'invoices', 'attendance', 'payroll', 'leave_requests', 'coding_questions', 'coding_tests', 'library', 'transport_routes', 'classes', 'assignments'];
mysql.createConnection({
  host: '217.21.85.14',
  user: 'nobl6990_Demo-SD',
  password: 'Q0N#k]q)s0A~aQOM',
  database: 'nobl6990_Demo1-SD'
}).then(async c => {
  for (const t of tables) {
    const [r] = await c.query('SELECT COUNT(*) as cnt FROM ' + t);
    console.log(t + ':', r[0].cnt, 'records');
  }
  c.end();
}).catch(e => console.log('Error:', e.message));
" 2>&1
echo ""

# Test 4: CRUD - Create Student
echo "### 4. CRUD TEST: Create Student"
RESPONSE=$(curl -s -X POST http://localhost:3000/api/data/students \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "STU-TEST-001",
    "studentId": "TEST001",
    "name": "Test Student",
    "admissionNumber": "TEST/2026/001",
    "email": "test@example.com",
    "status": "Active",
    "classId": "Grade 10-A",
    "uid": "admin-uid"
  }')
echo "Response: $RESPONSE"
echo ""

# Test 5: CRUD - Read
echo "### 5. CRUD TEST: Read Student"
curl -s http://localhost:3000/api/data/students/STU-TEST-001 | head -c 200
echo ""
echo ""

# Test 6: CRUD - Update
echo "### 6. CRUD TEST: Update Student"
RESPONSE=$(curl -s -X PUT http://localhost:3000/api/data/students/STU-TEST-001 \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Updated Test Student",
    "status": "Inactive"
  }')
echo "Response: $RESPONSE"
echo ""

# Test 7: Check Persistence
echo "### 7. DATA PERSISTENCE CHECK"
curl -s http://localhost:3000/api/data/students/STU-TEST-001 | grep -o '"name":"[^"]*"'
echo ""

# Test 8: CRUD - Delete
echo "### 8. CRUD TEST: Delete Student"
curl -s -X DELETE http://localhost:3000/api/data/students/STU-TEST-001
echo "Student deleted (if 200)"
echo ""

