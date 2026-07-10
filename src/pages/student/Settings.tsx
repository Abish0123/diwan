import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { useStudents } from '@/contexts/StudentContext';
import {
  User,
  Mail,
  Calendar,
  Phone,
  BookOpen,
  Lock,
  Bell,
  Shield,
  Eye,
  Globe,
  CreditCard,
  Smartphone,
  ChevronRight,
  CheckCircle,
  Settings,
  HelpCircle,
  ExternalLink,
  Monitor,
} from 'lucide-react';
import { toast } from 'sonner';
import { requestNotificationPermission } from '@/lib/pushNotifications';

const NAV_ITEMS = [
  { id: 'profile', label: 'Profile Settings', icon: User },
  { id: 'account', label: 'Account Settings', icon: Settings },
  { id: 'security', label: 'Security Settings', icon: Shield },
  { id: 'notifications', label: 'Notification Settings', icon: Bell },
  { id: 'privacy', label: 'Privacy Settings', icon: Eye },
  { id: 'theme', label: 'Theme Settings', icon: Globe },
  { id: 'language', label: 'Language Settings', icon: Globe, hasChevron: true },
  { id: 'payment', label: 'Payment Settings', icon: CreditCard, hasChevron: true },
  { id: 'app', label: 'App Preferences', icon: Smartphone },
];

export default function StudentSettings() {
  const { user } = useAuth();
  const { students } = useStudents();
  const [activeSection, setActiveSection] = useState('profile');

  const [emailNotif, setEmailNotif] = useState(true);
  const [smsNotif, setSmsNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(true);

  const student = useMemo(() => {
    if (!students?.length) return null;
    return students.find(
      (s) =>
        (user?.email && (s as any).email === user.email) ||
        (user?.displayName && (s as any).name === user.displayName)
    ) || students[0];
  }, [students, user]);

  const s = student as any;

  const fullName = s?.name || user?.displayName || '—';
  const email = s?.email || user?.email || '—';
  const studentId = s?.admissionNumber || s?.id || '—';
  const contactNumber = s?.phone || s?.contactNumber || '—';
  const parentEmail =
    s?.fatherEmail || s?.motherEmail || s?.guardianEmail || s?.parentEmail || '—';
  const dob = s?.dateOfBirth || s?.dob || '—';
  const grade = s?.grade ? `Grade ${s.grade}` : '—';
  const section = s?.section || '—';
  const gender = s?.gender || '—';
  const username =
    s?.email ? String(s.email).split('@')[0] : user?.email ? String(user.email).split('@')[0] : '—';
  const initials =
    fullName !== '—'
      ? fullName
          .split(' ')
          .map((p: string) => p[0])
          .filter(Boolean)
          .slice(0, 2)
          .join('')
          .toUpperCase()
      : 'ST';

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Page Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Settings className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage your account, preferences and security settings.
            </p>
          </div>
        </div>

        <div className="flex gap-6 items-start">
          {/* Left Nav */}
          <div className="w-1/4 min-w-[200px]">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <ul>
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => setActiveSection(item.id)}
                        className={`w-full flex items-center justify-between px-4 py-3 text-sm transition-colors ${
                          isActive
                            ? 'text-purple-600 font-semibold border-l-2 border-purple-600 bg-purple-50'
                            : 'text-gray-600 hover:bg-gray-50 border-l-2 border-transparent'
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <Icon className="w-4 h-4 shrink-0" />
                          {item.label}
                        </span>
                        {item.hasChevron && (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col gap-6">
            {/* Profile Settings */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="mb-5">
                <h2 className="text-base font-semibold text-gray-900">Profile Settings</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Update your personal information and profile details.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Full Name */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      readOnly
                      value={fullName}
                      className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      readOnly
                      value={email}
                      className="w-full pl-9 pr-32 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                      <CheckCircle className="w-3 h-3" />
                      Verified
                    </span>
                  </div>
                </div>

                {/* Date of Birth */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Date of Birth
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      readOnly
                      value={dob}
                      className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Gender
                  </label>
                  <select
                    disabled
                    value={gender}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none appearance-none"
                  >
                    <option>{gender}</option>
                  </select>
                </div>

                {/* Contact Number */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Contact Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      readOnly
                      value={contactNumber}
                      className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Class */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Class
                  </label>
                  <div className="relative">
                    <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <select
                      disabled
                      value={grade}
                      className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none appearance-none"
                    >
                      <option>{grade}</option>
                    </select>
                  </div>
                </div>

                {/* Section */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Section
                  </label>
                  <select
                    disabled
                    value={section}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none appearance-none"
                  >
                    <option>{section}</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Account Settings */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="mb-5">
                <h2 className="text-base font-semibold text-gray-900">Account Settings</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Manage your account preferences.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Username</label>
                  <input
                    type="text"
                    readOnly
                    value={username}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Student ID</label>
                  <input
                    type="text"
                    readOnly
                    value={studentId}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Parent/Guardian Email
                  </label>
                  <input
                    type="email"
                    readOnly
                    value={parentEmail}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="password"
                      readOnly
                      defaultValue="password"
                      className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none"
                    />
                    <button
                      onClick={() =>
                        toast.success('Password reset link sent to your registered email.')
                      }
                      className="shrink-0 flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-purple-600 border border-purple-200 rounded-xl hover:bg-purple-50 transition-colors"
                    >
                      <Lock className="w-4 h-4" />
                      Change Password
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Security Settings */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="mb-5">
                <h2 className="text-base font-semibold text-gray-900">Security Settings</h2>
                <p className="text-xs text-gray-500 mt-0.5">Keep your account secure.</p>
              </div>

              <div className="space-y-3">
                {/* Two-Factor Authentication */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-purple-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">Two-Factor Authentication</p>
                      <p className="text-xs text-gray-500">Add an extra layer of security</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-full border border-green-200">
                      <CheckCircle className="w-3 h-3" />
                      Enabled
                    </span>
                    <button
                      onClick={() => toast.info('Opening security settings…')}
                      className="text-xs font-semibold text-purple-600 border border-purple-200 px-3 py-1.5 rounded-lg hover:bg-purple-50 transition-colors"
                    >
                      Manage
                    </button>
                  </div>
                </div>

                {/* Login Alerts */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5 text-purple-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">Login Alerts</p>
                      <p className="text-xs text-gray-500">Get notified of new sign-ins</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-full border border-green-200">
                      <CheckCircle className="w-3 h-3" />
                      Enabled
                    </span>
                    <button
                      onClick={() => toast.info('Opening security settings…')}
                      className="text-xs font-semibold text-purple-600 border border-purple-200 px-3 py-1.5 rounded-lg hover:bg-purple-50 transition-colors"
                    >
                      Manage
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Notification Settings */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="mb-5">
                <h2 className="text-base font-semibold text-gray-900">Notification Settings</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Choose how you want to receive notifications.
                </p>
              </div>

              <div className="space-y-3">
                {/* Email Notifications */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-purple-500" />
                    <p className="text-sm font-medium text-gray-800">Email Notifications</p>
                  </div>
                  <button
                    onClick={() => setEmailNotif((v) => !v)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      emailNotif ? 'bg-purple-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        emailNotif ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* SMS Notifications */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-5 h-5 text-purple-500" />
                    <p className="text-sm font-medium text-gray-800">SMS Notifications</p>
                  </div>
                  <button
                    onClick={() => setSmsNotif((v) => !v)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      smsNotif ? 'bg-purple-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        smsNotif ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Push Notifications — in-app + same-tab browser alerts only;
                    there is no FCM/APNs behind this, so turning it on
                    actually requests real browser Notification permission
                    instead of just flipping decorative local state. */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5 text-purple-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">Push Notifications</p>
                      <p className="text-xs text-gray-500">In-app + browser alerts (while a tab is open)</p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (!pushNotif) {
                        const granted = await requestNotificationPermission();
                        if (!granted) {
                          toast.error("Browser notifications are blocked — enable them in your browser's site settings.");
                          return;
                        }
                      }
                      setPushNotif((v) => !v);
                    }}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      pushNotif ? 'bg-purple-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        pushNotif ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="w-1/4 min-w-[220px] flex flex-col gap-5">
            {/* Profile Avatar Card */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center mb-3">
                <span className="text-white text-xl font-bold tracking-wide">{initials}</span>
              </div>
              <p className="font-semibold text-gray-900 text-sm">{fullName}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {grade}
                {section !== '—' ? ` - ${section}` : ''}
              </p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-xs text-green-600 font-medium">Active Account</span>
              </div>
            </div>

            {/* Quick Settings */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <p className="text-sm font-semibold text-gray-800">Quick Settings</p>
              </div>
              <ul>
                {[
                  {
                    label: 'Change Password',
                    onClick: () => {
                      setActiveSection('account');
                      toast.info('Use the Change Password option in Account Settings.');
                    },
                  },
                  {
                    label: 'Notification Preferences',
                    onClick: () => {
                      setActiveSection('notifications');
                      toast.info('Opening notification preferences…');
                    },
                  },
                  {
                    label: 'Privacy Preferences',
                    onClick: () => {
                      setActiveSection('privacy');
                      toast.info('Opening privacy preferences…');
                    },
                  },
                  {
                    label: 'Theme Preferences',
                    onClick: () => {
                      setActiveSection('theme');
                      toast.info('Opening theme preferences…');
                    },
                  },
                  {
                    label: 'Language Preferences',
                    onClick: () => {
                      setActiveSection('language');
                      toast.info('Opening language preferences…');
                    },
                  },
                ].map((item) => (
                  <li key={item.label}>
                    <button
                      onClick={item.onClick}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors border-t border-slate-100"
                    >
                      {item.label}
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Session Management */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-sm font-semibold text-gray-800 mb-1">Session Management</p>
              <p className="text-xs text-gray-500 mb-3">You are currently logged in.</p>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 mb-3">
                <div className="flex items-start gap-2 mb-2">
                  <Monitor className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 leading-tight">
                      Windows • Chrome
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-tight">
                      Mumbai, India
                    </p>
                    <p className="text-xs text-gray-500 leading-tight">
                      20 May 2026, 10:30 AM
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  This Device
                </span>
              </div>

              <button
                onClick={() => toast.info('No other active sessions.')}
                className="w-full py-2 text-xs font-semibold text-purple-600 border border-purple-200 rounded-xl hover:bg-purple-50 transition-colors"
              >
                View All Sessions
              </button>
            </div>

            {/* Help & Support */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-1">
                <HelpCircle className="w-4 h-4 text-purple-500" />
                <p className="text-sm font-semibold text-gray-800">Help &amp; Support</p>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Need help with your account settings?
              </p>
              <ul className="space-y-2">
                {[
                  {
                    label: 'Visit Help Center',
                    onClick: () => toast.info('Opening Help Center…'),
                  },
                  {
                    label: 'Contact Support',
                    onClick: () => toast.info('Connecting you to Support…'),
                  },
                  {
                    label: 'Privacy Policy',
                    onClick: () => toast.info('Opening Privacy Policy…'),
                  },
                ].map((link) => (
                  <li key={link.label}>
                    <button
                      onClick={link.onClick}
                      className="flex items-center gap-2 text-xs text-purple-600 hover:text-purple-800 font-medium transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
