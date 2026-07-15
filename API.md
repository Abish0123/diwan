# Student Diwan — API Documentation

## Authentication Endpoints

### POST /api/session/login
Authenticate a user and return a session token.

**Request:**
```json
{
  "email": "admin@eduerp.com",
  "password": "admin123"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGc...",
  "user": {
    "uid": "user_123",
    "email": "admin@eduerp.com",
    "name": "Admin User",
    "role": "admin"
  }
}
```

**Response (401):**
```json
{
  "error": "Invalid credentials",
  "hints": ["Email: admin@eduerp.com", "Password: admin123"]
}
```

**Demo Accounts (SQLite/Preview Mode):**
- Staff: admin@eduerp.com / admin123
- Teacher: teacher@studentdiwan.com / teacher123
- Student: student@studentdiwan.com / student123
- Parent: parent@studentdiwan.com / parent123

---

### POST /api/session/forgot-password
Request password reset email. **Note:** Returns 500 in SQLite mode (SMTP not configured).

**Request:**
```json
{
  "email": "admin@eduerp.com"
}
```

**Response (200):**
```json
{
  "message": "Reset link sent to your email"
}
```

---

### POST /api/session/reset-password
Reset password with token.

**Request:**
```json
{
  "token": "reset_token_xyz",
  "password": "newPassword123"
}
```

**Response (200):**
```json
{
  "message": "Password reset successfully"
}
```

**Response (400):**
```json
{
  "error": "Invalid or expired reset token"
}
```

---

## Data Endpoints

### Base URL: `/api/data`

All data endpoints require Authorization header:
```
Authorization: Bearer <token>
```

### GET /api/data/students
Fetch all students for the authenticated user's school.

**Query Parameters:**
- `page` (number, default: 1) — Pagination page
- `limit` (number, default: 50) — Items per page
- `search` (string) — Filter by name or ID
- `grade` (string) — Filter by grade level

**Response (200):**
```json
[
  {
    "id": "std_001",
    "name": "Ahmed Ali",
    "email": "ahmed@school.com",
    "grade": "10A",
    "admissionDate": "2023-08-15",
    "status": "active"
  }
]
```

**Response (401):**
```json
{
  "error": "Unauthorized"
}
```

---

### POST /api/data/students
Create a new student. **Note:** Returns 500 in SQLite mode (MySQL-only route).

**Request:**
```json
{
  "name": "Fatima Khan",
  "email": "fatima@school.com",
  "grade": "9B",
  "admissionDate": "2024-01-10",
  "parentName": "Khan Sr.",
  "phoneNumber": "+92 300 1234567"
}
```

**Response (201):**
```json
{
  "id": "std_002",
  "name": "Fatima Khan",
  "email": "fatima@school.com",
  "grade": "9B",
  "createdAt": "2024-01-10T10:30:00Z"
}
```

**Response (400):**
```json
{
  "error": "Validation failed",
  "details": ["Email already exists"]
}
```

---

### PUT /api/data/students/:id
Update a student's information.

**Request:**
```json
{
  "name": "Fatima Khan",
  "grade": "9A",
  "status": "active"
}
```

**Response (200):**
```json
{
  "id": "std_002",
  "name": "Fatima Khan",
  "grade": "9A",
  "updatedAt": "2024-01-15T14:22:00Z"
}
```

---

### DELETE /api/data/students/:id
Delete a student record.

**Response (204):** No content

---

### GET /api/data/attendance
Fetch attendance records.

**Query Parameters:**
- `date` (string, ISO 8601) — Filter by date
- `studentId` (string) — Filter by student
- `classId` (string) — Filter by class

**Response (200):**
```json
[
  {
    "id": "att_001",
    "studentId": "std_001",
    "date": "2024-01-15",
    "status": "present",
    "markedBy": "teacher@school.com",
    "markedAt": "2024-01-15T09:00:00Z"
  }
]
```

---

### POST /api/data/attendance
Mark attendance for students.

**Request:**
```json
{
  "date": "2024-01-15",
  "records": [
    {
      "studentId": "std_001",
      "status": "present"
    },
    {
      "studentId": "std_002",
      "status": "absent"
    }
  ]
}
```

**Response (201):**
```json
{
  "created": 2,
  "updated": 0,
  "errors": []
}
```

---

## Status & Health Endpoints

### GET /api/health
Health check endpoint.

**Response (200 or 503):**
```json
{
  "status": "ok" | "degraded",
  "dbMode": "mysql" | "sqlite",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0.0"
}
```

**Note:** Returns `status: "degraded"` (HTTP 503) when running in SQLite preview mode (DB_HOST and DATABASE_URL not set).

---

## Error Handling

All endpoints return errors in this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": ["Additional info"]
}
```

**Common HTTP Status Codes:**
- `200` — Success
- `201` — Created
- `204` — No content
- `400` — Bad request (validation failed)
- `401` — Unauthorized (invalid token)
- `403` — Forbidden (insufficient permissions)
- `404` — Not found
- `500` — Server error
- `503` — Service unavailable (degraded SQLite mode)

---

## Authentication

### Token Format
JWT token returned on login. Include in all authenticated requests:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token Expiry
Tokens expire after 24 hours. Client must refresh or re-login.

### Role-Based Access

Certain endpoints require specific roles:

| Endpoint | Admin | Teacher | Student | Parent | Staff |
|----------|-------|---------|---------|--------|-------|
| GET /api/data/students | ✓ | ✓ | ✗ | ✗ | ✓ |
| POST /api/data/students | ✓ | ✗ | ✗ | ✗ | ✗ |
| PUT /api/data/students/:id | ✓ | ✗ | ✗ | ✗ | ✗ |
| DELETE /api/data/students/:id | ✓ | ✗ | ✗ | ✗ | ✗ |
| GET /api/data/attendance | ✓ | ✓ | ✗ | ✗ | ✗ |
| POST /api/data/attendance | ✓ | ✓ | ✗ | ✗ | ✗ |

---

## Environment Setup

### Development (SQLite)

```bash
# No environment variables needed for SQLite fallback
npm run dev
# Runs on http://localhost:3000
# API and frontend on same port via Vite proxy
```

### Production (MySQL)

```bash
export DATABASE_URL="mysql://username:password@localhost:3306/student_diwan"
export DB_HOST="localhost"
export PORT=3001

npm run build
npm start
```

### Test Environment

```bash
export NODE_ENV=test
npm run test
# SQLite used automatically
```

---

## Rate Limiting

**Note:** Currently no rate limiting implemented. Recommended for production:

```
- 100 requests/minute per IP for public endpoints
- 1000 requests/minute per authenticated user for data endpoints
- Burst allowance: 50 additional requests with 1-second backoff
```

---

## Webhooks

**Not currently implemented.** Planned for future releases:
- Attendance marked
- Student admitted
- Exam result published
- Invoice paid
