// ─────────────────────────────────────────────────────────────────────────────
// Learning Universe — curriculum-linked gamification module.
// Missions bind to real CurriculumWeek chapters (src/types/index.ts); every
// other subsystem (Wallet, House League, Classroom Olympics) reacts to a
// single event, submitMissionAttempt(), which is the sole place XP/coins/
// house-points get awarded. See src/contexts/LearningUniverseContext.tsx.
// ─────────────────────────────────────────────────────────────────────────────

export interface MissionQuestion {
  id: string;
  question: string;
  options: string[];           // exactly 4
  correctOptionIndex: number;
  explanation?: string;
}

export type MissionNarrativeTheme = 'space' | 'detective' | 'time-travel' | 'adventure' | 'default';

export interface Mission {
  id: string;
  uid: string;                  // school/tenant scope
  curriculumId: string;
  termId: string;
  unitId: string;
  weekId: string;                // path to the real CurriculumWeek this mission is bound to
  grade: string;
  subject: string;
  title: string;                 // chapter topic, or an AI-reframed narrative title
  narrative: string;             // AI-generated flavor text — generated once, cached, never regenerated per render
  narrativeTheme: MissionNarrativeTheme;
  questions: MissionQuestion[];  // AI-generated checkpoint quiz, derived from real chapter content
  xpReward: number;
  coinReward: number;
  housePointsReward: number;
  status: 'draft' | 'published';
  createdAt: string;
  updatedAt: string;
}

export interface MissionAttempt {
  id: string;
  uid: string;
  missionId: string;
  studentId: string;
  answers: number[];
  score: number;                 // 0-100
  passed: boolean;                // score >= 60
  xpAwarded: number;
  coinsAwarded: number;
  housePointsAwarded: number;
  completedAt: string;
}

export type WalletTransactionType = 'earn' | 'spend';
export type WalletTransactionSource = 'mission' | 'olympics' | 'shop' | 'bonus';

export interface WalletTransaction {
  id: string;
  uid: string;
  studentId: string;
  type: WalletTransactionType;
  source: WalletTransactionSource;
  refId?: string;                 // missionId / gameSetId / shopItemId
  amount: number;                  // coins, positive integer
  balanceAfter: number;            // snapshot at write time — balance itself is always re-derived from the ledger
  note: string;
  createdAt: string;
}

export type ShopItemCategory = 'avatar-frame' | 'avatar-badge' | 'title' | 'theme-color';

export interface ShopItem {
  id: string;
  uid: string;
  name: string;
  category: ShopItemCategory;
  cost: number;
  assetRef: string;                // icon name or CSS class — purely cosmetic, never real money
}

export interface StudentInventoryItem {
  id: string;
  uid: string;
  studentId: string;
  shopItemId: string;
  equipped: boolean;
  acquiredAt: string;
}

export interface House {
  id: string;
  uid: string;
  name: string;
  colorHex: string;
  icon: string;                    // lucide icon name
}

export interface HouseMembership {
  id: string;
  uid: string;
  studentId: string;
  houseId: string;
  assignedAt: string;
}

export type HousePointsSource = 'mission' | 'olympics';

export interface HousePointsLedgerEntry {
  id: string;
  uid: string;
  houseId: string;
  studentId: string;
  points: number;
  source: HousePointsSource;
  refId: string;
  createdAt: string;
}

export interface TeacherPersona {
  subject: string;
  name: string;
  avatarEmoji: string;
  systemInstruction: string;
}

export interface CareerSuggestion {
  title: string;
  matchReason: string;
  relatedSubjects: string[];
  confidence: 'low' | 'medium' | 'high';
}
