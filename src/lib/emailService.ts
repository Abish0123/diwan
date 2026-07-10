import { toast } from 'sonner';
import { LeadStatus } from '@/types/admissions';

export interface SimulatedEmail {
  to: string;
  toName: string;
  subject: string;
  body: string;
  type: string;
}

// Converts plain text body to simple HTML email
const toHtml = (text: string, subject: string): string => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f9f9f9;">
  <div style="background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#6c47ff,#a855f7);border-radius:8px;padding:20px 24px;margin-bottom:24px;">
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">Student Diwan School</h1>
      <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px;">Admissions Office</p>
    </div>
    <h2 style="color:#1e293b;font-size:16px;margin:0 0 16px;">${subject}</h2>
    ${text.split('\n').map(line =>
      line.trim() === ''
        ? '<br/>'
        : `<p style="color:#334155;font-size:14px;line-height:1.6;margin:6px 0;">${line}</p>`
    ).join('')}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
    <p style="color:#94a3b8;font-size:12px;margin:0;">This is an automated message from Student Diwan School Admissions System. Please do not reply directly to this email.</p>
  </div>
</body>
</html>`;

// Try to send a real email via the Express backend SMTP endpoint.
// Falls back silently if the server is unavailable (e.g. Vite-only dev server).
const sendRealEmail = async (email: SimulatedEmail): Promise<boolean> => {
  if (!email.to) return false;
  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email.to,
        subject: email.subject,
        html: toHtml(email.body, email.subject),
        text: email.body,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      console.log('[Email] Real email sent:', data.messageId, '→', email.to);
      return true;
    }
    const err = await res.json().catch(() => ({}));
    console.warn('[Email] SMTP endpoint error:', err.error || res.status);
    return false;
  } catch (e) {
    console.warn('[Email] SMTP endpoint unreachable (falling back to simulated):', (e as Error).message);
    return false;
  }
};

// Generic real-email sender for any module that isn't admissions-specific
// (exam notifications, etc.) — same real SMTP backend (/api/send-email) as
// every other email in this file, just without the Lead-comm-log/toast
// side effects those callers need. Returns true only if actually delivered.
export const sendPlainEmail = async (params: { to: string; toName: string; subject: string; body: string }): Promise<boolean> => {
  if (!params.to) return false;
  return sendRealEmail({ to: params.to, toName: params.toName, subject: params.subject, body: params.body, type: "general" });
};

// Logs an email entry into the comms panel, sends real email, and shows a toast
export const sendSimulatedEmail = async (
  email: SimulatedEmail,
  addComm?: (comm: { leadId: string; type: 'Email'; content: string; outcome: string }, silent?: boolean) => Promise<void>,
  leadId?: string,
) => {
  // Log to communication history
  if (addComm && leadId) {
    try {
      await addComm({ leadId, type: 'Email', content: `${email.subject}\n\n${email.body}`, outcome: 'Sent' }, true);
    } catch (err) {
      console.error('Failed to log email:', err);
    }
  }

  // Attempt to send a real email via SMTP
  const realSent = await sendRealEmail(email);

  toast.success(`Email sent to ${email.toName}`, {
    description: realSent
      ? `Delivered to ${email.to} — Subject: ${email.subject}`
      : `Subject: ${email.subject}`,
    duration: 7000,
  });
};

// Send a payment invoice email directly via the SMTP backend
export const sendInvoiceEmail = async (params: {
  to: string;
  toName: string;
  studentName: string;
  invoiceNo: string;
  amount: number;
  paymentType: 'Admission Fee' | 'Annual School Fee';
  paymentMethod: string;
  paidAt: string;
}): Promise<void> => {
  const { to, toName, studentName, invoiceNo, amount, paymentType, paymentMethod, paidAt } = params;
  if (!to || to === '—') {
    toast.success('Payment confirmed — invoice generated', { description: invoiceNo, duration: 6000 });
    return;
  }

  const dateStr = new Date(paidAt).toLocaleDateString('en-QA', { day: 'numeric', month: 'long', year: 'numeric' });
  const subject = `Payment Invoice — ${invoiceNo} | ${studentName}`;
  const text = `Dear ${toName},\n\nYour ${paymentType.toLowerCase()} payment has been confirmed by our finance team.\n\nInvoice Number: ${invoiceNo}\nStudent Name: ${studentName}\nPayment Type: ${paymentType}\nPayment Method: ${paymentMethod}\nAmount Paid: QAR ${amount.toLocaleString()}\nDate: ${dateStr}\nStatus: PAID\n\nPlease retain this invoice for your records.\n\nWarm regards,\nFinance & Admissions Team\nStudent Diwan School`;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f9f9f9;">
  <div style="background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#6c47ff,#a855f7);border-radius:8px;padding:20px 24px;margin-bottom:24px;">
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">Student Diwan School</h1>
      <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px;">Finance Office — Payment Invoice</p>
    </div>
    <h2 style="color:#1e293b;font-size:16px;margin:0 0 8px;">Payment Confirmed</h2>
    <p style="color:#64748b;font-size:14px;margin:0 0 20px;">Dear ${toName}, your ${paymentType.toLowerCase()} has been received and confirmed.</p>
    <table style="width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
      ${[
        ['Invoice Number', `<span style="font-family:monospace;letter-spacing:1px;font-weight:700;color:#6c47ff;">${invoiceNo}</span>`],
        ['Student Name', studentName],
        ['Payment Type', paymentType],
        ['Payment Method', paymentMethod],
        ['Amount Paid', `<span style="font-size:16px;font-weight:800;color:#1e293b;">QAR ${amount.toLocaleString()}</span>`],
        ['Date', dateStr],
        ['Status', '<span style="color:#16a34a;font-weight:800;">PAID ✓</span>'],
      ].map(([label, val], i) => `
        <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'};">
          <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;width:45%;">${label}</td>
          <td style="padding:12px 16px;font-size:13px;color:#334155;">${val}</td>
        </tr>`).join('')}
    </table>
    <p style="color:#94a3b8;font-size:12px;margin-top:20px;text-align:center;">This invoice was automatically generated by Student Diwan ERP. Please retain for your records.</p>
  </div></body></html>`;

  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, html, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      console.log('[Invoice Email] Sent to', to, '—', data.messageId);
      toast.success('Invoice emailed to parent', { description: `${invoiceNo} sent to ${to}`, duration: 7000 });
    } else {
      console.warn('[Invoice Email] SMTP error:', data.error);
      toast.success('Payment confirmed — invoice generated', { description: `${invoiceNo} | ${data.error || 'Email delivery pending'}`, duration: 6000 });
    }
  } catch (e) {
    console.warn('[Invoice Email] Unreachable:', (e as Error).message);
    toast.success('Payment confirmed — invoice generated', { description: invoiceNo, duration: 6000 });
  }
};

// Send a NEW-invoice notice — "please pay" — distinct from sendInvoiceEmail
// above, which is a PAID receipt. Used the moment an invoice is generated
// (admission fee on form submit, school fee on doc approval, first-term fee
// on enrollment) so the parent gets an honest "you owe this" email, not a
// premature "payment confirmed" one.
export const sendInvoiceGeneratedEmail = async (params: {
  to: string;
  toName: string;
  studentName: string;
  invoiceNo: string;
  amount: number;
  paymentType: string;
  dueDate: string;
}): Promise<void> => {
  const { to, toName, studentName, invoiceNo, amount, paymentType, dueDate } = params;
  if (!to || to === '—') {
    toast.success('Invoice generated', { description: invoiceNo, duration: 6000 });
    return;
  }

  const dueDateStr = new Date(dueDate).toLocaleDateString('en-QA', { day: 'numeric', month: 'long', year: 'numeric' });
  const subject = `Fee Invoice — ${invoiceNo} | ${studentName}`;
  const text = `Dear ${toName},\n\nA new invoice has been generated for ${studentName}.\n\nInvoice Number: ${invoiceNo}\nPayment Type: ${paymentType}\nAmount Due: QAR ${amount.toLocaleString()}\nDue Date: ${dueDateStr}\nStatus: UNPAID\n\nPlease complete payment at your earliest convenience via the parent/student portal, or contact our Finance office.\n\nWarm regards,\nFinance Team\nStudent Diwan School`;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f9f9f9;">
  <div style="background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:8px;padding:20px 24px;margin-bottom:24px;">
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">Student Diwan School</h1>
      <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px;">Finance Office — New Invoice</p>
    </div>
    <h2 style="color:#1e293b;font-size:16px;margin:0 0 8px;">Payment Due</h2>
    <p style="color:#64748b;font-size:14px;margin:0 0 20px;">Dear ${toName}, a new ${paymentType.toLowerCase()} invoice has been generated for ${studentName}.</p>
    <table style="width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
      ${[
        ['Invoice Number', `<span style="font-family:monospace;letter-spacing:1px;font-weight:700;color:#d97706;">${invoiceNo}</span>`],
        ['Student Name', studentName],
        ['Payment Type', paymentType],
        ['Amount Due', `<span style="font-size:16px;font-weight:800;color:#1e293b;">QAR ${amount.toLocaleString()}</span>`],
        ['Due Date', dueDateStr],
        ['Status', '<span style="color:#d97706;font-weight:800;">UNPAID</span>'],
      ].map(([label, val], i) => `
        <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'};">
          <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;width:45%;">${label}</td>
          <td style="padding:12px 16px;font-size:13px;color:#334155;">${val}</td>
        </tr>`).join('')}
    </table>
    <p style="color:#94a3b8;font-size:12px;margin-top:20px;text-align:center;">Please pay via the parent/student portal or contact Finance. A receipt will be emailed once payment is confirmed.</p>
  </div></body></html>`;

  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, html, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      console.log('[Invoice Generated Email] Sent to', to, '—', data.messageId);
      toast.success('Invoice emailed to parent', { description: `${invoiceNo} sent to ${to}`, duration: 7000 });
    } else {
      console.warn('[Invoice Generated Email] SMTP error:', data.error);
      toast.success('Invoice generated', { description: `${invoiceNo} | ${data.error || 'Email delivery pending'}`, duration: 6000 });
    }
  } catch (e) {
    console.warn('[Invoice Generated Email] Unreachable:', (e as Error).message);
    toast.success('Invoice generated', { description: invoiceNo, duration: 6000 });
  }
};

// Send a portal-login-credentials email directly via the SMTP backend.
// Used for both the student's own account and the parent's account —
// call once per recipient. Returns true if the SMTP endpoint accepted it.
export const sendCredentialsEmail = async (params: {
  to: string;
  toName: string;
  recipientRole: 'Student' | 'Parent';
  studentName: string;
  username: string;
  password: string;
  grade?: string;
  section?: string;
}): Promise<boolean> => {
  const { to, toName, recipientRole, studentName, username, password, grade, section } = params;
  if (!to) return false;

  const portalLabel = recipientRole === 'Student' ? 'Student Portal' : 'Parent Portal';
  const classLine = grade ? `\nClass: ${grade}${section ? ` — Section ${section}` : ''}` : '';
  const subject = `Your ${portalLabel} Login — ${studentName} | ${school}`;
  const text = `Dear ${toName},\n\nWelcome to ${school}! Your ${portalLabel.toLowerCase()} account has been created${recipientRole === 'Parent' ? ` for ${studentName}` : ''}.${classLine}\n\nLOGIN CREDENTIALS\nUsername: ${username}\nPassword: ${password}\n\nPlease log in and change your password after your first sign-in. Keep these credentials confidential.\n\nIf you did not expect this email, please contact our Admissions Office immediately.\n\nWarm regards,\nAdmissions & IT Support Team\n${school}`;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f9f9f9;">
  <div style="background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#6c47ff,#a855f7);border-radius:8px;padding:20px 24px;margin-bottom:24px;">
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">${school}</h1>
      <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px;">${portalLabel} — Login Credentials</p>
    </div>
    <h2 style="color:#1e293b;font-size:16px;margin:0 0 8px;">Welcome${recipientRole === 'Parent' ? `, ${toName}` : ''}!</h2>
    <p style="color:#64748b;font-size:14px;margin:0 0 20px;">Your ${portalLabel.toLowerCase()} account for <b>${studentName}</b>${grade ? ` (${grade}${section ? ` — Section ${section}` : ''})` : ''} is ready.</p>
    <table style="width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
      ${[
        ['Username', `<span style="font-family:monospace;letter-spacing:1px;font-weight:700;color:#6c47ff;">${username}</span>`],
        ['Password', `<span style="font-family:monospace;letter-spacing:1px;font-weight:700;color:#1e293b;">${password}</span>`],
      ].map(([label, val], i) => `
        <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'};">
          <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;width:35%;">${label}</td>
          <td style="padding:12px 16px;font-size:13px;color:#334155;">${val}</td>
        </tr>`).join('')}
    </table>
    <p style="color:#94a3b8;font-size:12px;margin-top:20px;">Please log in and change your password after first sign-in. Keep these credentials confidential.</p>
  </div></body></html>`;

  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, html, text }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      console.log(`[Credentials Email] ${recipientRole} email sent to`, to, '—', data.messageId);
      return true;
    }
    return false;
  } catch (e) {
    console.warn('[Credentials Email] Unreachable:', (e as Error).message);
    return false;
  }
};

const school = 'Student Diwan School';

// Only 4 stage-transition automated emails. Invoice emails are handled separately by sendInvoiceEmail.
export const getStageEmail = (
  status: LeadStatus,
  lead: { studentName: string; parentName?: string; email?: string; phone?: string; interestedClass?: string; allocatedGrade?: string; allocatedSection?: string },
): SimulatedEmail | null => {
  const parent = lead.parentName || 'Parent/Guardian';
  const student = lead.studentName;
  const grade = lead.interestedClass || '';
  const to = lead.email || '';
  const toName = parent;

  switch (status) {
    // 1. Enquiry → Form Sent
    case 'Form Sent':
      return {
        to, toName, type: 'form_link',
        subject: `Thank You for Your Enquiry — ${student} | ${school}`,
        body: `Dear ${parent},\n\nThank you for your enquiry about ${school}. We are delighted to receive your interest in enrolling ${student} for ${grade}.\n\nTo proceed with the admission, please complete the following steps:\n\n1. Fill in the Admission Application Form (link sent via WhatsApp/SMS)\n2. Pay the Application Fee of QAR 500 to confirm your application\n\nPayment Options:\n• Online (Card) — link provided in the form\n• Bank Transfer: QNB IBAN QA58 QNBA 0000 0000 6931 4503 201\n• Cash at our Finance Office\n\nFor assistance, contact us at +974 4000 0000 or visit our admissions office during working hours (Sun–Thu, 8 AM–4 PM).\n\nWarm regards,\nAdmissions Team\n${school}`,
      };

    // 2. Payment Done → Exam
    case 'Exam':
      return {
        to, toName, type: 'exam_interview_info',
        subject: `Application Confirmed — Entrance Exam & Interview Details | ${student}`,
        body: `Dear ${parent},\n\nWe are pleased to confirm that the application fee for ${student} has been received and verified.\n\nYour admission process is now progressing to the next stage:\n\nENTRANCE EXAM\n• Subjects: Mathematics & English\n• Duration: 90 minutes\n• Venue: To be communicated by our team\n• Please arrive 15 minutes early with a valid photo ID\n\nINTERVIEW (following exam results)\n• Format: In-person, approx. 20–30 minutes\n• Attendees: Parent/Guardian and Student\n• Documents to bring: Birth Certificate, Previous School Report Card, Parent ID\n\nOur team will contact you shortly with the confirmed exam date and time.\n\nWarm regards,\nAdmissions Team\n${school}`,
      };

    // 3. Interview Pass → Doc Verification (Offer Letter)
    case 'Doc Verification':
      return {
        to, toName, type: 'offer_letter',
        subject: `Offer Letter — Admission Offer for ${student} | ${school}`,
        body: `Dear ${parent},\n\nCongratulations! We are delighted to inform you that ${student} has successfully passed both the entrance exam and interview at ${school}.\n\nThis letter serves as a formal Admission Offer for ${grade}.\n\nSCHOOL FEES STRUCTURE (2025–2026)\n• Annual Tuition Fee: QAR 45,000\n• Registration Fee (one-time): QAR 2,000\n• Activity & Resource Fee: QAR 1,500\n• Total First Payment: QAR 48,500\n\nPayment Options:\n• Online (Card) — link will be shared\n• Bank Transfer: QNB IBAN QA58 QNBA 0000 0000 6931 4503 201 (Ref: ${student})\n• Cash at our Finance Office\n\nDOCUMENTS REQUIRED\nPlease submit the following original documents to the Admissions Office:\n1. Birth Certificate (original + copy)\n2. Previous School Report Card (last 2 years)\n3. Transfer/Leaving Certificate\n4. Parent/Guardian Passport Copy\n5. Qatar ID (student & parent)\n6. Medical Fitness Certificate\n7. 4 Passport-size Photographs\n\nThis offer is valid for 14 days. Please contact our admissions office if you have any questions.\n\nWelcome to the ${school} family!\n\nWarm regards,\nPrincipal & Admissions Team\n${school}`,
      };

    // 4. School Fee Paid → Section Allocation
    case 'Section Allocation':
      return {
        to, toName, type: 'section_allocation',
        subject: `Documents Verified & Class Allocated — ${student} | ${school}`,
        body: `Dear ${parent},\n\nWe are pleased to inform you that all submitted documents for ${student} have been verified successfully.\n\nCLASS ALLOCATION DETAILS\n• Student Name: ${student}\n• Grade: ${lead.allocatedGrade || grade}\n• Section: ${lead.allocatedSection || 'To be confirmed'}\n\nNEXT STEPS\n1. Collect your Student ID card from the Admissions Office\n2. Purchase the school uniform from our school store\n3. Log in to the Parent Portal to view the class timetable\n4. Join the parent WhatsApp group for your class\n5. First day of school: details will be shared shortly\n\nIf you have any questions, please contact us at +974 4000 0000.\n\nWe look forward to welcoming ${student} to ${school}!\n\nWarm regards,\nAdmissions & Administration Team\n${school}`,
      };

    default:
      return null;
  }
};
