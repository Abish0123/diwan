/* eslint-disable react-refresh/only-export-components */
/**
 * HRSettingsContext — global single source of truth for HR configuration.
 *
 * Settings are authored in /hr/settings (HRStaffSettingsDeepWorkflow) and
 * persisted to MySQL (via smartDb) under the "HRSettings" entity, id
 * "global". This context reads from that store and re-exposes typed values
 * so every module in the app can react to them without coupling to smartDb
 * directly.
 *
 * Usage:
 *   const { leaveTypes, shiftStart, payFrequency, ... } = useHRSettings();
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { smartDb } from '@/lib/localDb';

// ── Types ────────────────────────────────────────────────────────────────────

export interface HRLeaveType {
  name: string;
  days: string;      // e.g. "21" or "No limit"
  paid: boolean;
}

export interface SalaryComponent {
  name: string;
  type: 'Earning' | 'Deduction';
  pct: string;       // e.g. "25%"
}

export interface NotifRow {
  email: boolean;
  inapp: boolean;
  sms: boolean;
}

export interface HRSettings {
  // General
  institutionName: string;
  academicYear: string;
  empIdPrefix: string;
  overtimeThreshold: string;
  selfService: boolean;

  // Company letterhead
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;
  companyLogo: string;

  // Attendance
  biometric: boolean;
  geoFenced: boolean;
  qrCode: boolean;
  manualWeb: boolean;
  geoRadius: string;
  shiftStart: string;
  shiftEnd: string;
  gracePeriod: string;
  halfDayHrs: string;
  autoAbsent: string;
  regularCap: string;

  // Leave
  leaveTypes: HRLeaveType[];
  approvalLevels: string;   // '1level' | '2levels' | '3levels'
  notifyApplicant: boolean;
  autoReject: boolean;

  // Payroll
  payFrequency: string;     // 'monthly' | 'biweekly' | 'weekly'
  payDate: string;          // day-of-month
  salaryComponents: SalaryComponent[];

  // Recruitment
  offerExpiry: string;      // days
  probation: string;        // months
  mandatoryDemo: boolean;
  autoPublish: boolean;

  // Performance
  appraisalCycle: string;   // 'annual' | 'biannual'
  ratingScale: string;      // '5' | '10'
  peer360: boolean;

  // Benefits
  groupHealth: boolean;
  gratuityYears: string;
  autoGratuity: boolean;
  childFeeConc: string;
  canteenSubsidy: string;
  transportReimb: boolean;

  // Documents
  eSign: boolean;
  counterSig: boolean;
  sigReminder: boolean;
  storeDMS: boolean;

  // Notifications
  notifMatrix: Record<string, NotifRow>;
  dailyDigest: boolean;
  weeklySummary: boolean;

  // Policies
  enforceDigAck: boolean;
  forceReAck: boolean;
}

// ── Defaults (mirrors HRStaffSettingsDeepWorkflow initial state) ─────────────

const DEFAULTS: HRSettings = {
  institutionName: 'Student Diwan International School',
  academicYear: '2025-2026',
  empIdPrefix: 'SDIS-EMP-',
  overtimeThreshold: '45',
  selfService: true,

  companyAddress: 'P.O. Box 12345, Education City, Doha, Qatar',
  companyPhone: '+974 4000 1234',
  companyEmail: 'hr@studentdiwan.edu.qa',
  companyWebsite: 'www.studentdiwan.edu.qa',
  companyLogo: '',

  biometric: true,
  geoFenced: true,
  qrCode: true,
  manualWeb: false,
  geoRadius: '200',
  shiftStart: '07:00',
  shiftEnd: '14:30',
  gracePeriod: '15',
  halfDayHrs: '4',
  autoAbsent: '10:00',
  regularCap: '3',

  leaveTypes: [
    { name: 'Annual leave',    days: '21',       paid: true  },
    { name: 'Sick leave',      days: '14',       paid: true  },
    { name: 'Maternity leave', days: '90',       paid: true  },
    { name: 'Unpaid leave',    days: 'No limit', paid: false },
  ],
  approvalLevels: '3levels',
  notifyApplicant: true,
  autoReject: true,

  payFrequency: 'monthly',
  payDate: '25',
  salaryComponents: [
    { name: 'Basic salary',      type: 'Earning',   pct: '100%' },
    { name: 'Housing allowance', type: 'Earning',   pct: '25%'  },
    { name: 'Tax deduction',     type: 'Deduction', pct: '10%'  },
    { name: 'Provident fund',    type: 'Deduction', pct: '5%'   },
  ],

  offerExpiry: '7',
  probation: '6',
  mandatoryDemo: true,
  autoPublish: true,

  appraisalCycle: 'annual',
  ratingScale: '5',
  peer360: true,

  groupHealth: true,
  gratuityYears: '5',
  autoGratuity: true,
  childFeeConc: '50',
  canteenSubsidy: '15',
  transportReimb: true,

  eSign: true,
  counterSig: true,
  sigReminder: false,
  storeDMS: true,

  notifMatrix: {},
  dailyDigest: true,
  weeklySummary: true,

  enforceDigAck: true,
  forceReAck: true,
};

const SETTINGS_ID = 'global';

async function loadSettings(): Promise<HRSettings> {
  try {
    const row = await smartDb.getOne('HRSettings', SETTINGS_ID);
    if (!row) return DEFAULTS;
    return { ...DEFAULTS, ...row };
  } catch {
    return DEFAULTS;
  }
}

// ── Context ──────────────────────────────────────────────────────────────────

interface HRSettingsContextType extends HRSettings {
  /** Call after saving from the settings page to broadcast the change. */
  reloadSettings: () => void;
  /** Approval levels as a human-readable label */
  approvalLevelsLabel: string;
  /** Pay frequency label */
  payFrequencyLabel: string;
  /** Appraisal cycle label */
  appraisalCycleLabel: string;
}

const HRSettingsContext = createContext<HRSettingsContextType | undefined>(undefined);

export const HRSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<HRSettings>(DEFAULTS);

  useEffect(() => {
    let active = true;
    loadSettings().then((s) => { if (active) setSettings(s); });
    return () => { active = false; };
  }, []);

  const reloadSettings = useCallback(() => {
    loadSettings().then(setSettings);
  }, []);

  const approvalLevelsLabel =
    settings.approvalLevels === '1level'  ? '1 level — HOD' :
    settings.approvalLevels === '2levels' ? '2 levels — HOD, HR' :
                                             '3 levels — HOD, Principal, HR';

  const payFrequencyLabel =
    settings.payFrequency === 'weekly'   ? 'Weekly' :
    settings.payFrequency === 'biweekly' ? 'Bi-weekly' : 'Monthly';

  const appraisalCycleLabel =
    settings.appraisalCycle === 'biannual' ? 'Bi-annual (Sept & March)' : 'Annual (March)';

  const value = useMemo(() => ({
    ...settings,
    reloadSettings,
    approvalLevelsLabel,
    payFrequencyLabel,
    appraisalCycleLabel,
  }), [settings, reloadSettings, approvalLevelsLabel, payFrequencyLabel, appraisalCycleLabel]);

  return (
    <HRSettingsContext.Provider value={value}>
      {children}
    </HRSettingsContext.Provider>
  );
};

export function useHRSettings(): HRSettingsContextType {
  const ctx = useContext(HRSettingsContext);
  if (!ctx) throw new Error('useHRSettings must be used within HRSettingsProvider');
  return ctx;
}
