// Shared certificate-of-achievement HTML generator — extracted from
// academics/Achievements.tsx (the only real writer) so the parent-facing
// Achievements page can generate the exact same real certificate a student
// downloads, instead of a toast.info() stub with no file.
export interface CertificateData {
  title: string;
  event: string;
  grade: string;
  section: string;
  award: string;
  date: string;
  certNo: string;
}

export function buildCertificateHtml(ach: CertificateData, student: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${ach.title} — ${student}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Georgia,serif;background:#f5f3ff;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.cert{background:#fff;max-width:760px;width:100%;border:3px solid #7C3AED;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(124,58,237,.15)}
.hdr{background:linear-gradient(135deg,#7C3AED,#6D28D9);padding:28px;text-align:center;color:#fff}
.hdr h1{font-size:24px;letter-spacing:5px;text-transform:uppercase;margin-bottom:4px}
.hdr p{font-size:11px;letter-spacing:2px;opacity:.75}
.body{padding:44px;text-align:center}
.lbl{font-size:10px;text-transform:uppercase;letter-spacing:3px;color:#9CA3AF;margin-bottom:6px}
.ctitle{font-size:30px;font-weight:900;color:#7C3AED;margin-bottom:20px}
.student{font-size:30px;font-weight:900;color:#111;margin:6px 0}
.grade{font-size:13px;color:#6B7280;margin-bottom:20px}
.abox{background:#F5F3FF;border:1px solid #DDD6FE;border-radius:10px;padding:16px 36px;display:inline-block;margin-bottom:24px}
.abox .for{font-size:11px;color:#9CA3AF}
.abox h3{font-size:16px;font-weight:900;color:#5B21B6;margin:4px 0}
.abox .ev{font-size:11px;color:#6B7280}
.meta{display:flex;justify-content:center;gap:36px;font-size:11px;margin-bottom:28px;color:#6B7280}
.meta strong{display:block;font-size:13px;font-weight:700;color:#374151}
.sigs{display:flex;justify-content:space-between;align-items:flex-end;padding:16px 48px 0;border-top:1px dashed #E5E7EB}
.sig{text-align:center}
.sig-line{width:100px;height:1px;background:#9CA3AF;margin:0 auto 4px}
.sig p{font-size:10px;color:#9CA3AF}
.verify{font-size:9px;color:#C4B5FD;margin-top:16px;letter-spacing:2px;text-transform:uppercase}
</style></head>
<body><div class="cert">
<div class="hdr"><h1>Student Diwan</h1><p>International School &nbsp;•&nbsp; Certificate of Achievement</p></div>
<div class="body">
<p class="lbl">Certificate of</p>
<p class="ctitle">Achievement</p>
<p style="font-size:12px;color:#6B7280;margin-bottom:6px">This certificate is proudly presented to</p>
<p class="student">${student}</p>
<p class="grade">${ach.grade} &mdash; ${ach.section}</p>
<div class="abox"><p class="for">for achieving</p><h3>${ach.title}</h3><p class="ev">${ach.event}</p></div>
<div class="meta">
<div><strong>${ach.award}</strong>Award</div>
<div><strong>${ach.date}</strong>Date</div>
<div><strong>${ach.certNo}</strong>Cert No.</div>
</div>
<div class="sigs">
<div class="sig"><div class="sig-line"></div><p>Class Teacher</p></div>
<div class="sig"><div class="sig-line"></div><p>Principal</p></div>
</div>
<p class="verify">Verify at studentdiwan.com/verify/${ach.certNo}</p>
</div></div></body></html>`;
}

export function downloadCertificate(ach: CertificateData, student: string): void {
  const html = buildCertificateHtml(ach, student);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Certificate-${student.replace(/\s+/g, "-")}-${ach.certNo}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
