# 🎯 Student Diwan ERP - Complete MySQL Migration Guide

## ✅ What's Been Done

All data now saves to **cPanel MySQL** instead of Firebase:

### Backend API Created ✓
- `server/app.js` - Express server
- `server/config/database.js` - MySQL connection pool
- `server/routes/` - API endpoints for all data operations
- `server/init-db.js` - Database initialization script

### Frontend Updated ✓
- `src/lib/apiClient.ts` - New API client (replaces Firebase)
- `src/contexts/StudentContext.tsx` - Now uses MySQL API
- `src/contexts/AdmissionsContext.tsx` - Now uses MySQL API
- Removed all Firebase calls

### Database Configuration ✓
```
HOST: 217.21.85.14
DATABASE: nobl6990_Demo1-SD
USERNAME: nobl6990_Demo-SD
PASSWORD: Q0N#k]q)s0A~aQOM
PORT: 3306
```

---

## 🚀 Complete Setup Instructions

### Step 1: Install Backend Dependencies
```bash
cd server
npm install
```

### Step 2: Initialize MySQL Database Tables
```bash
node init-db.js
```

**Output Should Be:**
```
📋 Initializing database tables...
✅ Database tables created successfully!

Tables created:
  ✓ students
  ✓ leads
  ✓ attendance
  ✓ healthRecords
  ✓ behaviorIncidents
  ✓ exitRecords
```

### Step 3: Start Backend Server (New Terminal)
```bash
cd server
npm start
```

**Expected Output:**
```
🚀 Server running on http://localhost:5000
📱 Frontend: http://localhost:3100
```

### Step 4: Start Frontend (Keep running in existing terminal)
```bash
npm run dev
```

**Expected Output:**
```
VITE v... ready in ... ms

➜  Local:   http://localhost:3100/
```

---

## 📋 Database Structure

### Tables Created in MySQL:

#### 1. **students**
- id (VARCHAR) - Primary key
- name, classId, status, email, qidNumber
- gender, nationality, dateOfBirth, admissionDate
- attendance, feeStatus, performance, riskScore
- parentEngagement
- createdAt, updatedAt (timestamps)

#### 2. **leads** (Admissions)
- id (INT auto-increment)
- studentName, parentName, phone, email
- interestedClass, source, notes
- status (Enquiry → Interview → Admitted → Enrolled)
- studentId, allocatedGrade, allocatedSection
- createdAt, updatedAt

#### 3. **attendance**
- studentId, date, status
- Records per student per day

#### 4. **healthRecords**
- studentId, healthStatus, height, weight
- bloodType, allergies, medicalHistory

#### 5. **behaviorIncidents**
- studentId, incidentType, description
- date, severity

#### 6. **exitRecords**
- studentId, studentName, classId
- exitDate, exitReason
- tcNumber, destinationSchool, destinationCountry
- Clearance statuses (fees, library, transport)

---

## ✅ Testing the Integration

### Test 1: Add a New Student
1. Navigate to **Students → All Students**
2. Click **Add New Student**
3. Fill form and save
4. ✅ Should appear in the student list **AND** be saved in MySQL

### Test 2: Create Enquiry → Enroll
1. Navigate to **Admissions**
2. Click **Add New Enquiry** (Grade field is removed ✓)
3. Fill details and save
4. Go to **Pipeline** and **move to Interview**
5. Move to **Admitted** → **Enroll**
6. ✅ Student should appear in student directory

### Test 3: Record Exit
1. Navigate to **Student Exit / Withdrawal**
2. Select a student and record exit
3. ✅ Data saves to MySQL exitRecords table

### Test 4: Attendance
1. Navigate to **Attendance**
2. Mark attendance
3. ✅ Saves to MySQL attendance table

---

## 🔄 API Endpoints (Backend)

### Students
```
GET    /api/students           → All students
GET    /api/students/:id       → Single student
POST   /api/students           → Create student
PUT    /api/students/:id       → Update student
DELETE /api/students/:id       → Delete student
```

### Admissions
```
GET    /api/admissions         → All leads
POST   /api/admissions         → Create lead
PUT    /api/admissions/:id     → Update lead
POST   /api/admissions/:id/enroll → Enroll (creates student)
```

### Other
```
GET  /api/attendance           → Attendance records
POST /api/attendance           → Create attendance

GET  /api/health               → Health records
POST /api/health               → Create health record

GET  /api/incidents            → Behavior incidents
POST /api/incidents            → Create incident

GET  /api/exit-records         → Exit records
POST /api/exit-records         → Create exit record
```

---

## ⚙️ Troubleshooting

### Error: "Cannot connect to MySQL"
```
✗ Try: Check .env file has correct credentials
✗ Try: Verify cPanel is running (217.21.85.14 is reachable)
✗ Try: Restart backend server
```

### Error: "API not responding"
```
✗ Ensure backend is running on port 5000
✗ Check for port conflicts: netstat -ano | findstr :5000
✗ Restart with: npm start
```

### Error: "CORS issue"
```
✗ Backend CORS is configured for localhost:3100
✗ If using different port, update server/app.js line 14
```

### Error: "Tables don't exist"
```
✗ Run: node init-db.js
✗ Check MySQL connection first
```

---

## 📊 Data Flow

```
Frontend (React)
    ↓
apiClient.ts (HTTP requests)
    ↓
Express Backend (localhost:5000)
    ↓
MySQL Database (217.21.85.14)
```

**NO MORE FIREBASE!** All data flows directly to your cPanel MySQL.

---

## 🎯 Next Steps

1. ✅ Run backend: `cd server && npm start`
2. ✅ Run frontend: `npm run dev`
3. ✅ Initialize DB: `node init-db.js`
4. ✅ Test all features
5. ✅ Verify data in MySQL (via cPanel phpMyAdmin)

---

## 📝 Important Notes

- **All timestamps** are in MySQL format (YYYY-MM-DD HH:mm:ss)
- **Student IDs** can be custom or auto-generated
- **Lead IDs** are auto-increment integers
- **Sensitive data** in `.env` - never commit to git!
- **CORS** is configured for `http://localhost:3100`
- **Polling interval** is 5 seconds (adjust in contexts if needed)

---

## ❓ Questions?

Check the backend logs for error messages:
```bash
tail -f server.log
```

All MySQL errors will be logged in the terminal running the backend.

**Everything is now using your cPanel MySQL database! 🎉**
