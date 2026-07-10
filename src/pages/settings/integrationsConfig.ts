import {
  LayoutDashboard, Mail, MessagesSquare, Flame, CreditCard, Video, Sparkles,
  MapPin, BookOpen, CloudUpload, CalendarDays, Fingerprint, Code2,
} from "lucide-react";

export interface CredentialField {
  key: string;
  label: string;
  placeholder: string;
  type?: "text" | "password";
}

export interface SyncOption {
  key: string;
  label: string;
}

// One connectable service — Google Workspace has one, Payment Gateways has
// two (MyFatoorah, Stripe), Live Classes has three (Zoom, Teams, Meet), etc.
// `liveCheckPath` points at a REAL server route this app already exposes
// (payments/status, smtp-status) — providers without one are honestly
// reported "Not Connected" until an admin saves real credentials here;
// nothing claims a live third-party API call that doesn't actually happen.
export interface IntegrationProvider {
  id: string;
  name: string;
  description: string;
  credentialFields: CredentialField[];
  docsNote: string;
  liveCheckPath?: string;
  alwaysActive?: boolean; // Jitsi — no credentials needed, already powering real features
  activeNote?: string;
}

export interface IntegrationCategory {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  description: string;
  purpose: string[];
  features: string[];
  syncOptions?: SyncOption[];
  providers: IntegrationProvider[];
}

export const INTEGRATION_CATEGORIES: IntegrationCategory[] = [
  {
    id: "google-workspace",
    label: "Google Workspace",
    icon: Mail,
    description: "Google Login, school email, Drive backup, Meet scheduling, and Calendar — all under one Google Workspace connection.",
    purpose: ["Google Login", "Student Email", "Teacher Email", "Google Drive", "Google Meet", "Google Calendar"],
    features: ["Login with Google", "Google Classroom Sync (Optional)", "Google Drive Backup", "School Email", "Google Meet Scheduling"],
    syncOptions: [
      { key: "login", label: "Allow staff/parents to sign in with Google" },
      { key: "classroom", label: "Sync assignments with Google Classroom" },
      { key: "drive", label: "Back up documents to Google Drive" },
      { key: "email", label: "Route school email through Google Workspace" },
      { key: "meet", label: "Auto-generate Google Meet links for PTM/Live Classes" },
    ],
    providers: [
      {
        id: "google-workspace",
        name: "Google Workspace",
        description: "OAuth client for Google Login, Drive, Meet, Calendar and Workspace email.",
        credentialFields: [
          { key: "clientId", label: "OAuth Client ID", placeholder: "xxxxx.apps.googleusercontent.com" },
          { key: "clientSecret", label: "OAuth Client Secret", placeholder: "GOCSPX-••••••••", type: "password" },
          { key: "domain", label: "Workspace Domain", placeholder: "yourschool.edu" },
        ],
        docsNote: "Create an OAuth 2.0 Client ID in Google Cloud Console, then add this app's redirect URI under Authorized redirect URIs.",
      },
      {
        id: "smtp",
        name: "SMTP Email",
        description: "Transactional email — receipts, notifications, and password resets sent from your own mailbox. Set up as an alternative to Workspace OAuth for School Email.",
        credentialFields: [
          { key: "SMTP_HOST", label: "SMTP Host", placeholder: "smtp.gmail.com" },
          { key: "SMTP_PORT", label: "SMTP Port", placeholder: "587" },
          { key: "SMTP_USER", label: "SMTP Username", placeholder: "school@yourschool.edu" },
          { key: "SMTP_PASS", label: "SMTP Password", placeholder: "••••••••", type: "password" },
        ],
        docsNote: "For Gmail, use smtp.gmail.com:587 with an App Password (not your regular password). Set as server .env variables.",
        liveCheckPath: "/api/smtp-status",
      },
    ],
  },
  {
    id: "microsoft-365",
    label: "Microsoft 365",
    icon: MessagesSquare,
    description: "Microsoft Login, Outlook mail and calendar, Teams meetings, and OneDrive storage.",
    purpose: ["Microsoft Login", "Outlook Mail", "Teams", "OneDrive", "Outlook Calendar"],
    features: ["Office 365 Login", "Teams Meeting", "Outlook Calendar", "OneDrive Storage"],
    syncOptions: [
      { key: "login", label: "Allow staff/parents to sign in with Microsoft" },
      { key: "teams", label: "Auto-generate Teams links for meetings" },
      { key: "calendar", label: "Sync events to Outlook Calendar" },
      { key: "onedrive", label: "Back up documents to OneDrive" },
    ],
    providers: [{
      id: "microsoft-365",
      name: "Microsoft 365",
      description: "Azure AD app registration for Microsoft Login, Teams, Outlook and OneDrive.",
      credentialFields: [
        { key: "tenantId", label: "Directory (Tenant) ID", placeholder: "00000000-0000-0000-0000-000000000000" },
        { key: "clientId", label: "Application (Client) ID", placeholder: "00000000-0000-0000-0000-000000000000" },
        { key: "clientSecret", label: "Client Secret", placeholder: "••••••••", type: "password" },
      ],
      docsNote: "Register an app in Azure Portal → App registrations, then add a client secret under Certificates & secrets.",
    }],
  },
  {
    id: "whatsapp-business",
    label: "WhatsApp Business",
    icon: MessagesSquare,
    description: "Real WhatsApp delivery for attendance, fees, homework, exam results, PTM and emergency alerts.",
    purpose: ["Attendance Alerts", "Fee Reminder", "Homework", "Exam Results", "PTM Reminder", "Emergency Alerts"],
    features: ["Individual Messages", "Bulk Messaging", "Template Messages", "Delivery Status"],
    syncOptions: [
      { key: "attendance", label: "Attendance alerts" },
      { key: "fees", label: "Fee reminders" },
      { key: "homework", label: "Homework notifications" },
      { key: "exams", label: "Exam result alerts" },
      { key: "ptm", label: "PTM reminders" },
      { key: "emergency", label: "Emergency alerts" },
    ],
    providers: [{
      id: "whatsapp-business",
      name: "WhatsApp Business API",
      description: "Send template and bulk messages via the WhatsApp Business Platform.",
      credentialFields: [
        { key: "phoneNumberId", label: "Phone Number ID", placeholder: "1234567890" },
        { key: "accessToken", label: "Permanent Access Token", placeholder: "EAAG••••••••", type: "password" },
        { key: "businessAccountId", label: "WhatsApp Business Account ID", placeholder: "1234567890" },
      ],
      docsNote: "Get these from Meta for Developers → your app → WhatsApp → API Setup.",
    }],
  },
  {
    id: "firebase",
    label: "Firebase",
    icon: Flame,
    description: "Push notifications, OTP delivery, analytics and crash reporting.",
    purpose: ["Push Notifications", "OTP", "Analytics", "Crash Reports", "Cloud Messaging"],
    features: ["Android Notifications", "iOS Notifications", "Web Push", "Authentication (Optional)"],
    syncOptions: [
      { key: "android", label: "Android push notifications" },
      { key: "ios", label: "iOS push notifications" },
      { key: "web", label: "Web push notifications" },
      { key: "auth", label: "Use Firebase Authentication" },
    ],
    providers: [{
      id: "firebase",
      name: "Firebase",
      description: "Cloud Messaging, Authentication and Analytics for the mobile/web apps.",
      credentialFields: [
        { key: "projectId", label: "Project ID", placeholder: "studentdiwan-prod" },
        { key: "apiKey", label: "Web API Key", placeholder: "AIzaSy••••••••", type: "password" },
        { key: "serverKey", label: "Cloud Messaging Server Key", placeholder: "AAAA••••••••", type: "password" },
      ],
      docsNote: "Get these from Firebase Console → Project Settings → General / Cloud Messaging.",
    }],
  },
  {
    id: "payment-gateways",
    label: "Payment Gateways",
    icon: CreditCard,
    description: "Online payment collection for school, transport, hostel, library and event fees.",
    purpose: ["School Fees", "Transport Fees", "Hostel Fees", "Library Fines", "Event Payments"],
    features: [],
    providers: [
      {
        id: "paytabs",
        name: "PayTabs",
        description: "Real online fee payments — cards, Apple Pay, and mada via PayTabs' Hosted Payment Page.",
        credentialFields: [
          { key: "PAYTABS_PROFILE_ID", label: "Profile ID", placeholder: "12345" },
          { key: "PAYTABS_SERVER_KEY", label: "Server Key", placeholder: "S••••••••", type: "password" },
          { key: "PAYTABS_REGION", label: "Region (optional)", placeholder: "GLOBAL" },
        ],
        docsNote: "Get these from your PayTabs merchant dashboard under Developers → Key Management. Set as server .env variables.",
        liveCheckPath: "/api/payments/status",
      },
      {
        id: "myfatoorah",
        name: "MyFatoorah",
        description: "GCC-focused payment gateway supporting KNET, mada, Benefit and cards.",
        credentialFields: [
          { key: "apiKey", label: "API Token", placeholder: "••••••••", type: "password" },
          { key: "country", label: "Country", placeholder: "KWT / SAU / ARE / BHR / OMN / QAT" },
        ],
        docsNote: "Get your API Token from MyFatoorah Portal → Settings → API Keys.",
      },
      {
        id: "stripe",
        name: "Stripe",
        description: "International card payments for schools with overseas parent bases.",
        credentialFields: [
          { key: "publishableKey", label: "Publishable Key", placeholder: "pk_live_••••••••" },
          { key: "secretKey", label: "Secret Key", placeholder: "sk_live_••••••••", type: "password" },
        ],
        docsNote: "Get these from the Stripe Dashboard → Developers → API keys.",
      },
    ],
  },
  {
    id: "live-classes",
    label: "Live Classes",
    icon: Video,
    description: "Video conferencing for Live Classes and online Parent-Teacher Meetings.",
    purpose: [],
    features: ["Schedule Meeting", "Start Meeting", "Join Link", "Recording", "Attendance Sync"],
    providers: [
      {
        id: "jitsi",
        name: "Jitsi Meet",
        description: "Real video calls for Live Classes and Online/Hybrid Parent-Teacher Meetings — already live on the free public meet.jit.si server, no credentials needed.",
        credentialFields: [],
        docsNote: "No setup required — real meeting links are generated automatically for every Live Class and Online/Hybrid PTM.",
        alwaysActive: true,
        activeNote: "Academics → Live Classes, HR → PTM Booking (Online/Hybrid mode)",
      },
      {
        id: "zoom",
        name: "Zoom",
        description: "Schedule and start Zoom meetings for live classes directly from the timetable.",
        credentialFields: [
          // Zoom retired JWT apps in 2023 — Server-to-Server OAuth (what the
          // docs note below actually points to) needs these three fields,
          // not an apiKey/apiSecret pair. Fixed so the fields collected here
          // match what the real /api/integrations/zoom/create-meeting call
          // (server.ts) actually needs.
          { key: "accountId", label: "Account ID", placeholder: "••••••••" },
          { key: "clientId", label: "Client ID", placeholder: "••••••••" },
          { key: "clientSecret", label: "Client Secret", placeholder: "••••••••", type: "password" },
        ],
        docsNote: "Create a Server-to-Server OAuth app in the Zoom App Marketplace (Build App → Server-to-Server OAuth) to get these credentials.",
      },
      {
        id: "msteams",
        name: "Microsoft Teams",
        description: "Generate Teams meeting links for live classes and PTM bookings.",
        credentialFields: [
          { key: "tenantId", label: "Tenant ID", placeholder: "00000000-0000-0000-0000-000000000000" },
          { key: "clientId", label: "Client ID", placeholder: "00000000-0000-0000-0000-000000000000" },
          { key: "clientSecret", label: "Client Secret", placeholder: "••••••••", type: "password" },
        ],
        docsNote: "Uses the same Azure AD app registration as Microsoft 365 — grant it OnlineMeetings.ReadWrite permission.",
      },
      {
        id: "googlemeet-live",
        name: "Google Meet",
        description: "Generate Google Meet links for live classes and PTM bookings.",
        credentialFields: [
          { key: "clientId", label: "OAuth Client ID", placeholder: "xxxxx.apps.googleusercontent.com" },
          { key: "clientSecret", label: "OAuth Client Secret", placeholder: "GOCSPX-••••••••", type: "password" },
        ],
        docsNote: "Uses the same Google Cloud OAuth client as Google Workspace — enable the Google Calendar API for Meet link creation.",
      },
    ],
  },
  {
    id: "ai-services",
    label: "AI Services",
    icon: Sparkles,
    description: "AI-powered lesson planning, assignment generation, and student performance analysis.",
    purpose: [],
    features: [
      "Lesson Plan Generator", "Assignment Generator", "Question Paper Generator", "Flashcards",
      "Report Card Comments", "Student Performance Analysis", "AI Chat Assistant",
    ],
    providers: [
      {
        id: "openrouter",
        name: "OpenRouter",
        description: "The AI Chat Assistant, lesson plan and question paper generators try this first — a router across several free-tier models (Gemma, GPT-OSS, Qwen).",
        credentialFields: [{ key: "OPENROUTER_API_KEY", label: "API Key", placeholder: "sk-or-v1-••••••••", type: "password" }],
        docsNote: "Get an API key from openrouter.ai → Keys. Called directly from the browser, not through this server — set OPENROUTER_API_KEY wherever this app is built/deployed.",
        liveCheckPath: "/api/ai/status",
      },
      {
        id: "gemini",
        name: "Google Gemini",
        description: "Automatic fallback when OpenRouter is unavailable or rate-limited — same generator/assistant features, via the @google/genai SDK.",
        credentialFields: [{ key: "GEMINI_API_KEY", label: "API Key", placeholder: "AIzaSy••••••••", type: "password" }],
        docsNote: "Get an API key from Google AI Studio → Get API key. Set GEMINI_API_KEY wherever this app is built/deployed.",
        liveCheckPath: "/api/ai/status",
      },
    ],
  },
  {
    id: "maps-gps",
    label: "Maps & GPS",
    icon: MapPin,
    description: "Bus tracking, branch locations, and visitor navigation.",
    purpose: [],
    features: [],
    syncOptions: [
      { key: "bus", label: "School bus live tracking" },
      { key: "branch", label: "Branch location display" },
      { key: "visitor", label: "Visitor navigation" },
    ],
    providers: [{
      id: "openstreetmap",
      name: "OpenStreetMap (Leaflet)",
      description: "Already live and powering School Bus Tracking, GPS Parent Tracking and the location picker — free OSM tiles, no API key needed.",
      credentialFields: [],
      docsNote: "No setup required — react-leaflet renders live OSM tiles for every map in the app today.",
      alwaysActive: true,
      activeNote: "Transport → Routes, GPS Parent Tracking, Transport Tracking, and the school-wide Location Picker",
    }],
  },
  {
    id: "library-services",
    label: "Library Services",
    icon: BookOpen,
    description: "Automatic book lookup for the Library module.",
    purpose: [],
    features: ["Search Book", "ISBN Lookup", "Auto Fill Book Details", "Book Metadata"],
    providers: [{
      id: "google-books",
      name: "Google Books API",
      description: "Look up book metadata by ISBN or title when adding books to the Library catalogue.",
      credentialFields: [{ key: "apiKey", label: "API Key", placeholder: "AIzaSy••••••••", type: "password" }],
      docsNote: "Enable the Google Books API in Google Cloud Console and create an API key — free tier covers most school libraries.",
    }],
  },
  {
    id: "cloud-storage",
    label: "Cloud Storage",
    icon: CloudUpload,
    description: "Durable storage for assignments, videos, documents, certificates, report cards and recordings.",
    purpose: [],
    features: [],
    syncOptions: [
      { key: "assignments", label: "Assignments" },
      { key: "videos", label: "Videos" },
      { key: "documents", label: "Student Documents" },
      { key: "certificates", label: "Certificates" },
      { key: "reportCards", label: "Report Cards" },
      { key: "recordings", label: "Recordings" },
    ],
    providers: [{
      id: "aws-s3",
      name: "AWS S3",
      description: "Object storage bucket for uploaded files across the app.",
      credentialFields: [
        { key: "bucket", label: "Bucket Name", placeholder: "studentdiwan-uploads" },
        { key: "region", label: "Region", placeholder: "me-south-1" },
        { key: "accessKeyId", label: "Access Key ID", placeholder: "AKIA••••••••" },
        { key: "secretAccessKey", label: "Secret Access Key", placeholder: "••••••••", type: "password" },
      ],
      docsNote: "Create an IAM user with PutObject/GetObject permissions scoped to this bucket.",
    }],
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: CalendarDays,
    description: "Two-way sync of exams, timetable, PTM, events and holidays.",
    purpose: [],
    features: [],
    syncOptions: [
      { key: "exams", label: "Exams" },
      { key: "timetable", label: "Timetable" },
      { key: "ptm", label: "PTM" },
      { key: "events", label: "Events" },
      { key: "holidays", label: "Holidays" },
    ],
    providers: [{
      id: "google-calendar",
      name: "Google Calendar",
      description: "Sync school events, exams and PTM slots to staff and parent Google Calendars.",
      credentialFields: [
        { key: "clientId", label: "OAuth Client ID", placeholder: "xxxxx.apps.googleusercontent.com" },
        { key: "clientSecret", label: "OAuth Client Secret", placeholder: "GOCSPX-••••••••", type: "password" },
      ],
      docsNote: "Uses the same Google Cloud OAuth client as Google Workspace — enable the Google Calendar API.",
    }],
  },
  {
    id: "attendance-devices",
    label: "Attendance Devices",
    icon: Fingerprint,
    description: "Automatic check-in/out sync from campus biometric and RFID devices.",
    purpose: [],
    features: ["Auto Attendance", "Shift Management", "Attendance Sync", "Payroll Integration"],
    syncOptions: [
      { key: "autoAttendance", label: "Auto Attendance" },
      { key: "shiftManagement", label: "Shift Management" },
      { key: "attendanceSync", label: "Attendance Sync" },
      { key: "payrollIntegration", label: "Payroll Integration" },
    ],
    providers: [
      {
        id: "zkteco-rfid",
        name: "ZKTeco RFID",
        description: "Card-based attendance devices at campus gates.",
        credentialFields: [
          { key: "deviceIp", label: "Device IP Address", placeholder: "192.168.1.201" },
          { key: "commKey", label: "Communication Key", placeholder: "0" },
        ],
        docsNote: "Find the device IP and comm key in the ZKTeco device's network settings menu.",
      },
      {
        id: "fingerprint",
        name: "Fingerprint",
        description: "Biometric fingerprint scanners for staff and student check-in.",
        credentialFields: [
          { key: "deviceIp", label: "Device IP Address", placeholder: "192.168.1.202" },
          { key: "port", label: "Port", placeholder: "4370" },
        ],
        docsNote: "Fingerprint devices expose a local SDK port — check the device manual for the default port.",
      },
      {
        id: "face-recognition",
        name: "Face Recognition",
        description: "Contactless face-recognition attendance terminals.",
        credentialFields: [
          { key: "apiEndpoint", label: "Terminal API Endpoint", placeholder: "https://192.168.1.203/api" },
          { key: "apiKey", label: "API Key", placeholder: "••••••••", type: "password" },
        ],
        docsNote: "Get the local API endpoint and key from the terminal's admin console.",
      },
    ],
  },
];

export { LayoutDashboard, Code2 };
