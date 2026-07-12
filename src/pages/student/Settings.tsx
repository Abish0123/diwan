import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { useStudents } from '@/contexts/StudentContext';
import { userRepository } from '@/repositories/UserRepository';
import {
  User,
  Mail,
  Calendar,
  Phone,
  BookOpen,
  Lock,
  Bell,
  Smartphone,
  ChevronRight,
  CheckCircle,
  Settings,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { requestNotificationPermission } from '@/lib/pushNotifications';
import { useTranslation } from 'react-i18next';

// Privacy/Theme/Language/Payment/App nav items were removed — this page
// never had section-conditional rendering (every card below always
// rendered regardless of `activeSection`), so those five items were dead
// buttons that changed highlighted state but revealed nothing.
const NAV_ITEMS = [
  { id: 'profile', label: 'Profile Settings', icon: User },
  { id: 'account', label: 'Account Settings', icon: Settings },
  { id: 'notifications', label: 'Notification Settings', icon: Bell },
];

export default function StudentSettings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { students } = useStudents();
  const [activeSection, setActiveSection] = useState('profile');

  const navLabelKeys: Record<string, string> = {
    profile: 'student.settings.navProfile',
    account: 'student.settings.navAccount',
    notifications: 'student.settings.navNotifications',
  };

  // Real per-account preferences, persisted on the user's own `users` row
  // via the self-write carve-out (server.ts USER_SELF_WRITABLE_FIELDS) —
  // same fix as ParentSettings.tsx. These used to be local-only useState,
  // silently resetting to "on" on every reload.
  const [emailNotif, setEmailNotif] = useState(true);
  const [smsNotif, setSmsNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(true);
  const [changingPassword, setChangingPassword] = useState(false);
  // Editable drafts for the fields already in USER_SELF_WRITABLE_FIELDS
  // (name/displayName, phone) — previously rendered readOnly even though
  // the exact same write path already works for emailNotif/smsNotif below.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    userRepository.getOne(user.uid).then(row => {
      if (!row) return;
      if (typeof row.emailNotif === "boolean") setEmailNotif(row.emailNotif);
      if (typeof row.smsNotif === "boolean") setSmsNotif(row.smsNotif);
    }).catch(() => {});
  }, [user?.uid]);

  async function updateNotifPref(field: "emailNotif" | "smsNotif", value: boolean) {
    if (!user?.uid) return;
    try {
      await userRepository.update(user.uid, { [field]: value } as any);
    } catch {
      toast.error(t('student.settings.savePrefFailed'));
    }
  }

  async function handleChangePassword() {
    if (!user?.email || changingPassword) return;
    setChangingPassword(true);
    try {
      const res = await fetch("/api/session/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t('student.settings.resetEmailFailed'));
        return;
      }
      toast.success(data.message || t('student.settings.resetEmailSent'));
    } catch {
      toast.error(t('student.settings.serverUnreachable'));
    } finally {
      setChangingPassword(false);
    }
  }

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
  const grade = s?.grade ? t('student.settings.gradeLabel', { grade: s.grade }) : '—';
  const section = s?.section || '—';
  const gender = s?.gender || '—';
  const username =
    s?.email ? String(s.email).split('@')[0] : user?.email ? String(user.email).split('@')[0] : '—';

  // Seed the editable drafts once the real values resolve; after that the
  // draft (what the student is editing / has saved) wins over the source
  // record.
  useEffect(() => {
    if (nameDraft === null && fullName !== '—') setNameDraft(fullName);
  }, [fullName, nameDraft]);
  useEffect(() => {
    if (phoneDraft === null && contactNumber !== '—') setPhoneDraft(contactNumber);
  }, [contactNumber, phoneDraft]);

  const displayName = nameDraft ?? fullName;
  const displayPhone = phoneDraft ?? contactNumber;
  const profileDirty = displayName !== fullName || displayPhone !== contactNumber;

  async function saveProfileFields() {
    if (!user?.uid) return;
    setSavingProfile(true);
    try {
      await userRepository.update(user.uid, { name: displayName, displayName, phone: displayPhone } as any);
      toast.success(t('student.settings.profileUpdated'));
    } catch {
      toast.error(t('student.settings.profileSaveFailed'));
    } finally {
      setSavingProfile(false);
    }
  }

  const initials =
    displayName !== '—'
      ? displayName
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
            <h1 className="text-2xl font-bold text-gray-900">{t('student.settings.pageTitle')}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {t('student.settings.pageSubtitle')}
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
                            ? 'text-purple-600 font-semibold border-s-2 border-purple-600 bg-purple-50'
                            : 'text-gray-600 hover:bg-gray-50 border-s-2 border-transparent'
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <Icon className="w-4 h-4 shrink-0" />
                          {t(navLabelKeys[item.id])}
                        </span>
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
            {activeSection === 'profile' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="mb-5">
                <h2 className="text-base font-semibold text-gray-900">{t('student.settings.profileTitle')}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('student.settings.profileSubtitle')}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Full Name */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t('student.settings.fullNameLabel')}
                  </label>
                  <div className="relative">
                    <User className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={displayName === '—' ? '' : displayName}
                      onChange={(e) => setNameDraft(e.target.value)}
                      className="w-full ps-9 pe-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t('student.settings.emailAddressLabel')}
                  </label>
                  <div className="relative">
                    <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      readOnly
                      value={email}
                      className="w-full ps-9 pe-32 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none"
                    />
                    <span className="absolute end-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                      <CheckCircle className="w-3 h-3" />
                      {t('student.settings.verifiedBadge')}
                    </span>
                  </div>
                </div>

                {/* Date of Birth */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t('student.settings.dobLabel')}
                  </label>
                  <div className="relative">
                    <Calendar className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      readOnly
                      value={dob}
                      className="w-full ps-9 pe-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t('student.settings.genderLabel')}
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
                    {t('student.settings.contactNumberLabel')}
                  </label>
                  <div className="relative">
                    <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={displayPhone === '—' ? '' : displayPhone}
                      onChange={(e) => setPhoneDraft(e.target.value)}
                      placeholder={t('student.settings.contactNumberPlaceholder')}
                      className="w-full ps-9 pe-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  </div>
                </div>

                {/* Class */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t('student.settings.classLabel')}
                  </label>
                  <div className="relative">
                    <BookOpen className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <select
                      disabled
                      value={grade}
                      className="w-full ps-9 pe-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none appearance-none"
                    >
                      <option>{grade}</option>
                    </select>
                  </div>
                </div>

                {/* Section */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t('student.settings.sectionLabel')}
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

              <div className="flex justify-end mt-5">
                <button
                  onClick={saveProfileFields}
                  disabled={savingProfile || !profileDirty}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-purple-600 rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  {savingProfile ? t('student.settings.savingButton') : t('student.settings.saveChangesButton')}
                </button>
              </div>
            </div>
            )}

            {/* Account Settings */}
            {activeSection === 'account' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="mb-5">
                <h2 className="text-base font-semibold text-gray-900">{t('student.settings.accountTitle')}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('student.settings.accountSubtitle')}
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('student.settings.usernameLabel')}</label>
                  <input
                    type="text"
                    readOnly
                    value={username}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('student.settings.studentIdLabel')}</label>
                  <input
                    type="text"
                    readOnly
                    value={studentId}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t('student.settings.parentEmailLabel')}
                  </label>
                  <input
                    type="email"
                    readOnly
                    value={parentEmail}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('student.settings.passwordLabel')}</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="password"
                      readOnly
                      value="••••••••"
                      aria-label={t('student.settings.passwordHiddenAria')}
                      className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none"
                    />
                    <button
                      onClick={handleChangePassword}
                      disabled={changingPassword}
                      className="shrink-0 flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-purple-600 border border-purple-200 rounded-xl hover:bg-purple-50 transition-colors disabled:opacity-60"
                    >
                      <Lock className="w-4 h-4" />
                      {changingPassword ? t('student.settings.sendingButton') : t('student.settings.changePasswordButton')}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5">{t('student.settings.resetEmailNote', { email })}</p>
                </div>
              </div>
            </div>
            )}

            {/* Notification Settings */}
            {activeSection === 'notifications' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="mb-5">
                <h2 className="text-base font-semibold text-gray-900">{t('student.settings.notificationsTitle')}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('student.settings.notificationsSubtitle')}
                </p>
              </div>

              <div className="space-y-3">
                {/* Email Notifications */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-purple-500" />
                    <p className="text-sm font-medium text-gray-800">{t('student.settings.emailNotifLabel')}</p>
                  </div>
                  <button
                    onClick={() => { const v = !emailNotif; setEmailNotif(v); updateNotifPref("emailNotif", v); }}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      emailNotif ? 'bg-purple-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 start-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        emailNotif ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* SMS Notifications */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-5 h-5 text-purple-500" />
                    <p className="text-sm font-medium text-gray-800">{t('student.settings.smsNotifLabel')}</p>
                  </div>
                  <button
                    onClick={() => { const v = !smsNotif; setSmsNotif(v); updateNotifPref("smsNotif", v); }}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      smsNotif ? 'bg-purple-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 start-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
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
                      <p className="text-sm font-medium text-gray-800">{t('student.settings.pushNotifLabel')}</p>
                      <p className="text-xs text-gray-500">{t('student.settings.pushNotifDesc')}</p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (!pushNotif) {
                        const granted = await requestNotificationPermission();
                        if (!granted) {
                          toast.error(t('student.settings.pushBlocked'));
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
                      className={`absolute top-0.5 start-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        pushNotif ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="w-1/4 min-w-[220px] flex flex-col gap-5">
            {/* Profile Avatar Card */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center mb-3">
                <span className="text-white text-xl font-bold tracking-wide">{initials}</span>
              </div>
              <p className="font-semibold text-gray-900 text-sm">{displayName}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {grade}
                {section !== '—' ? ` - ${section}` : ''}
              </p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-xs text-green-600 font-medium">{t('student.settings.activeAccount')}</span>
              </div>
            </div>

            {/* Quick Settings */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <p className="text-sm font-semibold text-gray-800">{t('student.settings.quickSettingsTitle')}</p>
              </div>
              <ul>
                {[
                  {
                    label: t('student.settings.quickChangePasswordLabel'),
                    onClick: () => { setActiveSection('account'); handleChangePassword(); },
                  },
                  {
                    label: t('student.settings.quickNotificationPrefsLabel'),
                    onClick: () => setActiveSection('notifications'),
                  },
                ].map((item) => (
                  <li key={item.label}>
                    <button
                      onClick={item.onClick}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors border-t border-slate-100"
                    >
                      {item.label}
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400 rtl:rotate-180" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Help & Support */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-1">
                <HelpCircle className="w-4 h-4 text-purple-500" />
                <p className="text-sm font-semibold text-gray-800">{t('student.settings.helpSupportTitle')}</p>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                {t('student.settings.helpSupportDesc')}
              </p>
              <ul className="space-y-2">
                {[
                  {
                    label: t('student.settings.messageSchoolOfficeLabel'),
                    onClick: () => navigate('/communication/messages'),
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
