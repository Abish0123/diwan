# Student Diwan ERP - Backend API

Express.js backend that connects to cPanel MySQL database.

## Setup

### 1. Install Backend Dependencies
```bash
cd server
npm install
```

### 2. Initialize Database Tables
```bash
node init-db.js
```

This will create all necessary tables in your MySQL database:
- `students` - Student records
- `leads` - Admissions enquiries
- `attendance` - Attendance records
- `healthRecords` - Health information
- `behaviorIncidents` - Behavior/incident records
- `exitRecords` - Student exit records

### 3. Start Backend Server
```bash
npm start        # Production
npm run dev      # Development (with auto-reload)
```

Server will run on: **http://localhost:5000**

## Database Configuration

The backend reads database credentials from `.env` file:
```
DB_HOST=217.21.85.14
DB_DATABASE=nobl6990_Demo1-SD
DB_USERNAME=nobl6990_Demo-SD
DB_PASSWORD=Q0N#k]q)s0A~aQOM
DB_PORT=3306
```

## API Endpoints

### Students
- `GET /api/students` - Get all students
- `GET /api/students/:id` - Get single student
- `POST /api/students` - Create student
- `PUT /api/students/:id` - Update student
- `DELETE /api/students/:id` - Delete student

### Admissions
- `GET /api/admissions` - Get all leads
- `POST /api/admissions` - Create lead
- `PUT /api/admissions/:id` - Update lead
- `POST /api/admissions/:id/enroll` - Enroll lead (creates student)

### Attendance
- `GET /api/attendance` - Get attendance records
- `POST /api/attendance` - Add attendance record

### Health
- `GET /api/health` - Get health records
- `POST /api/health` - Create health record

### Behavior
- `GET /api/incidents` - Get behavior incidents
- `POST /api/incidents` - Create incident

### Student Exit
- `GET /api/exit-records` - Get exit records
- `POST /api/exit-records` - Create exit record

## Frontend Integration

Update the frontend to use this API instead of Firebase:

```javascript
// Example: Replace Firebase calls with API calls
const fetchStudents = async () => {
  const response = await fetch('http://localhost:5000/api/students');
  const students = await response.json();
  return students;
};
```

## Notes

- All timestamps are in MySQL format (YYYY-MM-DD HH:mm:ss)
- IDs are auto-generated for most tables (INT) except students (VARCHAR for STD-XXXX format)
- CORS is enabled for frontend at http://localhost:3100
- All sensitive data should be in `.env` (never commit to version control)
