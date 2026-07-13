/**
 * Global DOM auto-translation layer.
 *
 * When Arabic is active, this walks the rendered DOM and replaces known
 * English strings (from the locale files + a comprehensive ERP dictionary)
 * with Arabic. A MutationObserver keeps newly rendered content translated,
 * so every module/page is covered without needing t() calls in each file.
 */
import en from './locales/en.json';
import ar from './locales/ar.json';

type JsonObj = { [k: string]: string | JsonObj };

// ---------- Build dictionary ----------
const dict = new Map<string, string>();

function addPair(enVal: string, arVal: string) {
  const key = enVal.trim();
  if (key && arVal && key !== arVal) dict.set(key.toLowerCase(), arVal);
}

function flattenPairs(enNode: JsonObj, arNode: JsonObj | undefined) {
  if (!arNode) return;
  for (const k of Object.keys(enNode)) {
    const e = enNode[k];
    const a = arNode[k];
    if (typeof e === 'string' && typeof a === 'string') addPair(e, a);
    else if (typeof e === 'object' && typeof a === 'object') flattenPairs(e, a as JsonObj);
  }
}
flattenPairs(en as unknown as JsonObj, ar as unknown as JsonObj);

// Comprehensive ERP / UI term dictionary (extends the locale files)
const MANUAL: Record<string, string> = {
  // Generic UI
  'Save': 'حفظ', 'Cancel': 'إلغاء', 'Delete': 'حذف', 'Edit': 'تعديل', 'Add': 'إضافة',
  'Create': 'إنشاء', 'Update': 'تحديث', 'Search': 'بحث', 'Filter': 'تصفية', 'Filters': 'التصفية',
  'Export': 'تصدير', 'Import': 'استيراد', 'Print': 'طباعة', 'Download': 'تنزيل', 'Upload': 'رفع',
  'Submit': 'إرسال', 'Close': 'إغلاق', 'Open': 'فتح', 'View': 'عرض', 'Details': 'التفاصيل',
  'Actions': 'الإجراءات', 'Action': 'إجراء', 'Status': 'الحالة', 'Active': 'نشط', 'Inactive': 'غير نشط',
  'Yes': 'نعم', 'No': 'لا', 'OK': 'موافق', 'Confirm': 'تأكيد', 'Back': 'رجوع', 'Next': 'التالي',
  'Previous': 'السابق', 'Loading...': 'جارٍ التحميل...', 'Loading': 'جارٍ التحميل',
  'No data': 'لا توجد بيانات', 'No results': 'لا توجد نتائج', 'No results found': 'لم يتم العثور على نتائج',
  'Total': 'الإجمالي', 'Name': 'الاسم', 'Email': 'البريد الإلكتروني', 'Phone': 'الهاتف',
  'Address': 'العنوان', 'Date': 'التاريخ', 'Time': 'الوقت', 'Type': 'النوع', 'Description': 'الوصف',
  'Amount': 'المبلغ', 'Notes': 'ملاحظات', 'Remarks': 'ملاحظات', 'Select': 'اختيار',
  'All': 'الكل', 'None': 'لا شيء', 'Other': 'أخرى', 'New': 'جديد', 'Apply': 'تطبيق',
  'Reset': 'إعادة تعيين', 'Refresh': 'تحديث', 'Retry': 'إعادة المحاولة', 'Send': 'إرسال',
  'Reply': 'رد', 'Approve': 'موافقة', 'Reject': 'رفض', 'Pending': 'قيد الانتظار',
  'Approved': 'تمت الموافقة', 'Rejected': 'مرفوض', 'Completed': 'مكتمل', 'In Progress': 'قيد التنفيذ',
  'Draft': 'مسودة', 'Published': 'منشور', 'Archived': 'مؤرشف', 'Overview': 'نظرة عامة',
  'Summary': 'الملخص', 'Profile': 'الملف الشخصي', 'Logout': 'تسجيل الخروج', 'Sign out': 'تسجيل الخروج',
  'Sign in': 'تسجيل الدخول', 'Password': 'كلمة المرور', 'Male': 'ذكر', 'Female': 'أنثى',
  'Today': 'اليوم', 'Yesterday': 'أمس', 'This Week': 'هذا الأسبوع', 'This Month': 'هذا الشهر',
  'This Year': 'هذه السنة', 'Monday': 'الاثنين', 'Tuesday': 'الثلاثاء', 'Wednesday': 'الأربعاء',
  'Thursday': 'الخميس', 'Friday': 'الجمعة', 'Saturday': 'السبت', 'Sunday': 'الأحد',
  'January': 'يناير', 'February': 'فبراير', 'March': 'مارس', 'April': 'أبريل', 'May': 'مايو',
  'June': 'يونيو', 'July': 'يوليو', 'August': 'أغسطس', 'September': 'سبتمبر',
  'October': 'أكتوبر', 'November': 'نوفمبر', 'December': 'ديسمبر',
  // People / roles
  'Student': 'طالب', 'Students': 'الطلاب', 'Teacher': 'معلم', 'Teachers': 'المعلمون',
  'Parent': 'ولي أمر', 'Parents': 'أولياء الأمور', 'Staff': 'الموظفون', 'Admin': 'مدير',
  'Administrator': 'المسؤول', 'Principal': 'مدير المدرسة', 'Accountant': 'محاسب',
  'Librarian': 'أمين المكتبة', 'Driver': 'سائق', 'User': 'مستخدم', 'Users': 'المستخدمون',
  'Guardian': 'ولي الأمر', 'Father': 'الأب', 'Mother': 'الأم',
  // Academic
  'Class': 'الفصل', 'Classes': 'الفصول', 'Section': 'الشعبة', 'Grade': 'الصف',
  'Subject': 'المادة', 'Subjects': 'المواد', 'Exam': 'امتحان', 'Exams': 'الامتحانات',
  'Marks': 'الدرجات', 'Result': 'النتيجة', 'Results': 'النتائج', 'Attendance': 'الحضور',
  'Present': 'حاضر', 'Absent': 'غائب', 'Late': 'متأخر', 'Excused': 'بعذر',
  'Timetable': 'الجدول الدراسي', 'Schedule': 'الجدول', 'Assignment': 'واجب',
  'Assignments': 'الواجبات', 'Homework': 'الواجب المنزلي', 'Syllabus': 'المنهج',
  'Curriculum': 'المنهج الدراسي', 'Semester': 'الفصل الدراسي', 'Term': 'الفصل',
  'Academic Year': 'العام الدراسي', 'Admission': 'القبول', 'Roll Number': 'رقم القيد',
  'Report Card': 'بطاقة التقرير', 'Certificate': 'شهادة', 'Library': 'المكتبة',
  'Book': 'كتاب', 'Books': 'الكتب', 'Lesson': 'درس', 'Lessons': 'الدروس',
  'Quiz': 'اختبار قصير', 'Test': 'اختبار', 'Score': 'النتيجة', 'Average': 'المتوسط',
  'Percentage': 'النسبة المئوية', 'Rank': 'الترتيب', 'Pass': 'ناجح', 'Fail': 'راسب',
  // Finance
  'Fee': 'الرسوم', 'Fees': 'الرسوم', 'Payment': 'الدفع', 'Payments': 'المدفوعات',
  'Invoice': 'فاتورة', 'Invoices': 'الفواتير', 'Receipt': 'إيصال', 'Balance': 'الرصيد',
  'Paid': 'مدفوع', 'Unpaid': 'غير مدفوع', 'Overdue': 'متأخر السداد', 'Discount': 'خصم',
  'Salary': 'الراتب', 'Payroll': 'الرواتب', 'Expense': 'مصروف', 'Expenses': 'المصروفات',
  'Revenue': 'الإيرادات', 'Income': 'الدخل', 'Budget': 'الميزانية', 'Tax': 'الضريبة',
  'Currency': 'العملة', 'Bank': 'البنك', 'Cash': 'نقدًا', 'Online': 'عبر الإنترنت',
  'Transaction': 'معاملة', 'Transactions': 'المعاملات', 'Due Date': 'تاريخ الاستحقاق',
  // Communication
  'Message': 'رسالة', 'Messages': 'الرسائل', 'Announcement': 'إعلان', 'Announcements': 'الإعلانات',
  'Notification': 'إشعار', 'Notifications': 'الإشعارات', 'Event': 'فعالية', 'Events': 'الفعاليات',
  'Meeting': 'اجتماع', 'Calendar': 'التقويم', 'Inbox': 'الوارد', 'Sent': 'المرسل',
  // Transport / hostel / misc
  'Transport': 'النقل', 'Route': 'المسار', 'Routes': 'المسارات', 'Vehicle': 'مركبة',
  'Vehicles': 'المركبات', 'Hostel': 'السكن الداخلي', 'Room': 'غرفة', 'Rooms': 'الغرف',
  'Visitor': 'زائر', 'Visitors': 'الزوار', 'Inventory': 'المخزون', 'Stock': 'المخزون',
  'Vendor': 'مورد', 'Vendors': 'الموردون', 'Purchase': 'شراء', 'Purchases': 'المشتريات',
  'Asset': 'أصل', 'Assets': 'الأصول', 'Department': 'القسم', 'Departments': 'الأقسام',
  'Branch': 'الفرع', 'Branches': 'الفروع', 'Reports': 'التقارير', 'Report': 'تقرير',
  'Analytics': 'التحليلات', 'Dashboard': 'لوحة التحكم', 'Settings': 'الإعدادات',
  'Permissions': 'الصلاحيات', 'Leave': 'إجازة', 'Holiday': 'عطلة', 'Holidays': 'العطلات',
  // Common composite phrases (page titles, stats, headers)
  'Total Students': 'إجمالي الطلاب', 'Total Staff': 'إجمالي الموظفين',
  'Total Marks': 'مجموع الدرجات', 'Total Revenue': 'إجمالي الإيرادات',
  'Total Expenses': 'إجمالي المصروفات', 'Total Records': 'إجمالي السجلات',
  'Total Allocated': 'إجمالي المخصص', 'Active Students': 'الطلاب النشطون',
  'Active Today': 'نشط اليوم', 'Present Today': 'الحاضرون اليوم',
  'New Admissions': 'القبول الجديد', 'Upcoming Exams': 'الامتحانات القادمة',
  'Class Average': 'متوسط الفصل', 'Pass Rate': 'نسبة النجاح',
  'Passing Marks': 'درجة النجاح', 'Pending Assignments': 'الواجبات المعلقة',
  'Take Attendance': 'تسجيل الحضور', 'Create Assignment': 'إنشاء واجب',
  'View Reports': 'عرض التقارير', 'View profile': 'عرض الملف الشخصي',
  'View List': 'عرض القائمة', 'View All': 'عرض الكل', 'View Details': 'عرض التفاصيل',
  'On Leave': 'في إجازة', 'On Duty': 'في الخدمة', 'Blood Group': 'فصيلة الدم',
  'Date of Birth': 'تاريخ الميلاد', 'Medical Certificate': 'شهادة طبية',
  'ID number': 'رقم الهوية', 'Select category': 'اختر الفئة',
  'Select grade': 'اختر الصف', 'Select Status': 'اختر الحالة',
  'Select vehicle': 'اختر المركبة', 'Select class': 'اختر الفصل',
  'Select subject': 'اختر المادة', 'Select section': 'اختر الشعبة',
  'All Statuses': 'جميع الحالات', 'All Classes': 'جميع الفصول',
  'All Grades': 'جميع الصفوف', 'All Sections': 'جميع الشعب',
  'All Subjects': 'جميع المواد', 'All Students': 'جميع الطلاب',
  'Student Directory': 'دليل الطلاب', 'Staff Directory': 'دليل الموظفين',
  'Student & ID': 'الطالب والرقم', 'In directory': 'في الدليل',
  'At Risk (AI)': 'في خطر (ذكاء اصطناعي)', 'At Risk Students': 'الطلاب المعرضون للخطر',
  'Low Attendance': 'حضور منخفض', 'AI Priority': 'أولوية الذكاء الاصطناعي',
  'AI Insight': 'رؤية الذكاء الاصطناعي', 'AI Command': 'أمر الذكاء الاصطناعي',
  'Central Database': 'قاعدة البيانات المركزية', 'Clean Up Credentials': 'تنظيف بيانات الاعتماد',
  'Fee Collection Overview': 'نظرة عامة على تحصيل الرسوم',
  'Student Distribution by Grade': 'توزيع الطلاب حسب الصف',
  'View full breakdown': 'عرض التفاصيل الكاملة',
  'No invoices generated yet': 'لم يتم إنشاء فواتير بعد',
  'awaiting review': 'في انتظار المراجعة', 'vs last month': 'مقارنة بالشهر الماضي',
  'Action needed': 'إجراء مطلوب', 'this month': 'هذا الشهر',
  'Attendance Overview': 'نظرة عامة على الحضور', 'Fee Collection': 'تحصيل الرسوم',
  'Table': 'جدول', 'Cards': 'بطاقات', 'List': 'قائمة', 'Grid': 'شبكة',
  'Questions': 'الأسئلة', 'Duration': 'المدة', 'Documents': 'المستندات',
  'Available': 'متاح', 'Upcoming': 'قادم', 'Submitted': 'تم التسليم',
  'Scheduled': 'مجدول', 'Enrolled': 'مسجل', 'Drafts': 'المسودات',
  'Trips': 'الرحلات', 'Reference': 'المرجع', 'Optional': 'اختياري',
  'Gender': 'الجنس', 'Theme': 'المظهر', 'Tests': 'الاختبارات',
  'LUNCH BREAK': 'استراحة الغداء', 'BREAK': 'استراحة',
  'School Admin': 'مدير المدرسة', 'Admin Demo': 'مدير تجريبي',
  'Search by student name, ID, parent contact': 'البحث باسم الطالب أو الرقم أو بيانات ولي الأمر',
  'Search students': 'البحث عن الطلاب',
  'Risk ≥ 75 or attendance < 75%': 'خطر ≥ 75 أو حضور < 75%',
  'No invoices generated yet': 'لم يتم إنشاء فواتير بعد',
  'Manage, monitor and automate student records with AI insights.': 'إدارة ومراقبة وأتمتة سجلات الطلاب برؤى الذكاء الاصطناعي.',
  'No records found': 'لم يتم العثور على سجلات', 'No students found': 'لم يتم العثور على طلاب',
  'Add Student': 'إضافة طالب', 'Add Staff': 'إضافة موظف', 'Add New': 'إضافة جديد',
  'Save Changes': 'حفظ التغييرات', 'Discard': 'تجاهل', 'Continue': 'متابعة',
  'First Name': 'الاسم الأول', 'Last Name': 'اسم العائلة', 'Full Name': 'الاسم الكامل',
  'Contact': 'جهة الاتصال', 'Nationality': 'الجنسية', 'Religion': 'الديانة',
  'Category': 'الفئة', 'Priority': 'الأولوية', 'High': 'مرتفع', 'Medium': 'متوسط', 'Low': 'منخفض',
  'Performance': 'الأداء', 'Progress': 'التقدم', 'Actions Required': 'الإجراءات المطلوبة',
  'Recent Activity': 'النشاط الأخير', 'Quick Links': 'روابط سريعة',
  'Academic': 'أكاديمي', 'Financial': 'مالي', 'General': 'عام',
};
for (const [e, a] of Object.entries(MANUAL)) addPair(e, a);

// ---------- Translation helpers ----------
function lookup(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || /^[\d\s.,:%/+-]+$/.test(trimmed)) return null; // numbers/punctuation only
  const lower = trimmed.toLowerCase();
  const direct = dict.get(lower);
  if (direct) return direct;
  // Strip trailing punctuation (colon, ellipsis, asterisk, period) and retry
  const m = trimmed.match(/^(.*?)(\.{3}|[:…*.!?])\s*$/);
  if (m) {
    const base = dict.get(m[1].trim().toLowerCase());
    if (base) return base + m[2];
  }
  return null;
}

function translateTextNode(node: Text) {
  const original = node.nodeValue;
  if (!original) return;
  const translated = lookup(original);
  if (translated) {
    // Preserve leading/trailing whitespace
    const lead = original.match(/^\s*/)?.[0] ?? '';
    const trail = original.match(/\s*$/)?.[0] ?? '';
    node.nodeValue = lead + translated + trail;
  }
}

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

function translateElementAttrs(el: Element) {
  for (const attr of ATTRS) {
    const val = el.getAttribute(attr);
    if (val) {
      const translated = lookup(val);
      if (translated) el.setAttribute(attr, translated);
    }
  }
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE']);

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (SKIP_TAGS.has(el.tagName)) return;
  if (el.getAttribute?.('data-no-translate') !== null && el.getAttribute?.('data-no-translate') !== undefined) return;
  translateElementAttrs(el);
  for (const child of Array.from(el.childNodes)) walk(child);
}

// ---------- Observer lifecycle ----------
let observer: MutationObserver | null = null;
let scheduled = false;
let pendingRoots: Set<Node> = new Set();

function flush() {
  scheduled = false;
  const roots = Array.from(pendingRoots);
  pendingRoots = new Set();
  for (const r of roots) {
    if (r.isConnected) walk(r);
  }
}

export function startAutoTranslate() {
  if (observer) return;
  // Initial full-page pass
  walk(document.body);
  observer = new MutationObserver((mutations) => {
    for (const mut of mutations) {
      if (mut.type === 'characterData' && mut.target) pendingRoots.add(mut.target);
      for (const node of Array.from(mut.addedNodes)) pendingRoots.add(node);
    }
    if (!scheduled && pendingRoots.size > 0) {
      scheduled = true;
      requestAnimationFrame(flush);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

export function stopAutoTranslate() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  pendingRoots = new Set();
}
