# Student Departure & Status Management Procedure

## Overview
When a student leaves the school (graduates, transfers, withdraws, or is suspended), their status must be updated in the system to maintain accurate records and analytics.

---

## Student Status Types

| Status | Meaning | Action Required |
|--------|---------|-----------------|
| **Active** | Currently enrolled student | Normal operations |
| **Graduated** | Successfully completed their grade level | Archive records, generate transcripts |
| **Transferred** | Moved to another school | Archive records, issue transfer certificate |
| **Left** | Withdrew from school (before graduation) | Archive records, note withdrawal reason |
| **Suspended** | Temporarily suspended from school | Update status, maintain records |

---

## Where to Update Student Status

### **Method 1: From Students List (Students Page)**

1. Navigate to **Students** section in sidebar
2. Find the student in the list or search for them
3. Click on student row to open **Student Details Dialog**
4. In the dialog, you'll see:
   - Status dropdown (currently shows: "Active")
   - Personal information
   - Academic performance
   - Fees status
5. **Change status** from dropdown
6. Click **"Save Changes"** button
7. Confirmation message appears

### **Method 2: Bulk Update (For Multiple Students)**

1. Go to **Students** section
2. Use **"Status Filter"** dropdown to show students by status
3. Select multiple students using checkboxes
4. Click **"Bulk Actions"** button
5. Choose **"Change Status"** option
6. Select new status
7. Apply to all selected students

---

## Step-by-Step: Marking a Student as Graduated

### **Step 1: Open Students Page**
- Click **"Students"** in left sidebar
- System shows all 509 students

### **Step 2: Find the Student**
- **Option A (Quick Search):** Use search box at top, type student name
- **Option B (Filter):** Use Status filter to view "Active" students only

### **Step 3: Open Student Details**
- Click on the student's row in the table
- **Student Details Dialog** opens (shows full profile)

### **Step 4: Change Status**
- Locate **"Status"** field (currently shows: "Active")
- Click dropdown and select **"Graduated"**

### **Step 5: Add Departure Notes (Optional)**
- Note in the **"Notes"** field:
  - Graduation date
  - Final grade achieved
  - Remarks (e.g., "Top performer in class")

### **Step 6: Save Changes**
- Click **"Save"** or **"Update"** button
- Toast message: "Student status updated successfully"
- Dialog closes
- Student list refreshes with updated status

---

## Step-by-Step: Marking a Student as Transferred

### **Differences from Graduation:**

1. **Status:** Select **"Transferred"** (not "Graduated")
2. **Transfer Certificate:** Generate from **"Documents"** tab in dialog
3. **Note Details:**
   - Transfer date
   - New school name (if known)
   - Reason for transfer
4. **Final Checklist:**
   - [ ] Collect outstanding fees (if any)
   - [ ] Issue transfer certificate
   - [ ] Upload withdrawal form
   - [ ] Archive academic records
   - [ ] Save forwarding address

---

## Step-by-Step: Marking a Student as "Left School"

### **When to Use:**
- Student withdrew before graduation
- Student left due to relocation
- Student left for any other reason

### **Procedure:**

1. Open student profile (same as graduation steps 1-3)
2. Change status to **"Left"**
3. In notes, record:
   - Withdrawal date
   - Reason for leaving
   - Outstanding fees (if any)
   - Where they transferred (if known)
4. Under **"Fees"** tab:
   - Mark any pending invoices as "Cancelled" or "Write-off"
   - Or collect before departure
5. Save changes

---

## System Impacts When Changing Status

### **Active → Graduated/Transferred/Left:**

| Feature | Impact |
|---------|--------|
| **Attendance** | Student no longer appears in daily attendance |
| **Billing** | Invoices stop generating; existing ones archived |
| **Health Records** | Kept for historical reference |
| **Admissions** | Student marked as "Enrolled → Graduated/Left" |
| **Reports** | Excluded from "Active Students" but included in "All Students" |
| **Finance** | Final account settled; no new charges |
| **Transcript** | Can be generated showing full history |

---

## Before Marking as Departed: Checklist

**For ALL departures (Graduated, Transferred, Left):**

- [ ] Verify all **fees are paid or settled**
  - Outstanding fees collected OR marked as write-off
- [ ] Download/print **academic records** if needed
- [ ] Print **transcript** for parent/new school
- [ ] Collect **library books** and **uniforms**
- [ ] Check **health records** are complete
- [ ] Update **emergency contacts** for follow-ups
- [ ] Issue **leaving certificate** (if transferred)
- [ ] Confirmation from **Accounts Department** (fees cleared)
- [ ] Confirmation from **Admissions Department** (records archived)

---

## Access Control

| Role | Can Change Status | Can View Departed Students |
|------|-------------------|---------------------------|
| Admin | ✅ Yes | ✅ Yes |
| Admission Officer | ✅ Yes | ✅ Yes |
| Finance Officer | ❌ No (view only) | ✅ Yes |
| Class Teacher | ❌ No | ✅ Yes (their class only) |
| Parent | ❌ No | ❌ No |
| Student | ❌ No | ❌ No |

---

## Common Issues & Solutions

### **Issue: Can't find the status field**
**Solution:** Open Student Details dialog → Look for "Status" field at top section

### **Issue: Status won't change**
**Solution:** Check if you have Admin permissions. Finance officers can only view status.

### **Issue: Need to undo status change**
**Solution:** Open student profile again, change status back to "Active", save

### **Issue: Multiple students to update**
**Solution:** Use Bulk Upload feature or Bulk Actions from Students list

---

## Reporting & Analytics

After marking students as departed, they will:

**Appear in:**
- "All Students" reports
- "Historical Records" reports
- Graduation/Transfer statistics

**Disappear from:**
- "Active Students" dashboard
- Daily attendance
- Fee billing cycle
- Current class rosters

---

## Data Retention Policy

Even after marking a student as departed:
- ✅ All academic records are **retained permanently** for auditing
- ✅ Health records **kept for 5 years** (medical requirement)
- ✅ Financial records **kept for 7 years** (legal requirement)
- ✅ Attendance records **never deleted**
- ✅ Email/communication history **retained** for reference

---

## Support & Questions

**For help with:**
- **Status updates:** Contact Admin / Admissions Officer
- **Fees settlement:** Contact Finance Department
- **Record generation:** Contact Admissions Officer
- **System issues:** Contact IT Support

---

**Last Updated:** June 23, 2026  
**Version:** 1.0  
**Owner:** School Administration Team
