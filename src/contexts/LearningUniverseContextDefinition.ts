import { createContext } from "react";
import type {
  Mission, MissionAttempt, WalletTransaction, ShopItem, StudentInventoryItem,
  House, HouseMembership, HousePointsLedgerEntry,
} from "@/types/learningUniverse";

export interface HouseStanding {
  house: House;
  totalPoints: number;
  memberCount: number;
}

export interface LearningUniverseContextType {
  missions: Mission[];
  attempts: MissionAttempt[];
  transactions: WalletTransaction[];
  shopItems: ShopItem[];
  inventory: StudentInventoryItem[];
  houses: House[];
  memberships: HouseMembership[];
  housePointsLedger: HousePointsLedgerEntry[];
  loading: boolean;

  // Derived (never stored) helpers — balance/standings are always re-computed
  // from the ledger, never a mutable field, so there's nothing to desync.
  getWalletBalance: (studentId: string) => number;
  getStudentXp: (studentId: string) => number;
  getHouseStandings: () => HouseStanding[];
  getStudentHouse: (studentId: string) => House | undefined;
  hasPassedMission: (missionId: string, studentId: string) => boolean;

  // Mission CRUD (admin/teacher — Mission Generator)
  createMission: (mission: Omit<Mission, "id" | "createdAt" | "updatedAt">) => Promise<Mission | undefined>;
  updateMission: (id: string, updates: Partial<Mission>) => Promise<void>;
  deleteMission: (id: string) => Promise<void>;

  // The one completion event every other subsystem hangs off.
  submitMissionAttempt: (
    missionId: string,
    studentId: string,
    answers: number[]
  ) => Promise<MissionAttempt>;

  // Olympics payout — same mechanism as missions, source-tagged 'olympics'.
  awardOlympicsCompletion: (
    studentId: string,
    subject: string,
    score: number,
    refId: string
  ) => Promise<void>;

  // House assignment
  assignHouseIfMissing: (studentId: string) => Promise<void>;

  // Wallet spend flow
  purchaseShopItem: (studentId: string, shopItemId: string) => Promise<{ ok: boolean; error?: string }>;
  equipInventoryItem: (studentId: string, inventoryItemId: string) => Promise<void>;
}

export const LearningUniverseContext = createContext<LearningUniverseContextType | undefined>(undefined);
