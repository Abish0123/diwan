import React, { useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import {
  LearningUniverseContext, type LearningUniverseContextType, type HouseStanding,
} from "./LearningUniverseContextDefinition";
import type {
  Mission, MissionAttempt, WalletTransaction, ShopItem, StudentInventoryItem,
  House, HouseMembership, HousePointsLedgerEntry,
} from "@/types/learningUniverse";
import { LEARNING_UNIVERSE_SHOP_SEED } from "@/data/learningUniverseShopSeed";
import { LEARNING_UNIVERSE_HOUSE_SEED } from "@/data/learningUniverseHouseSeed";

// ── Defensive normalizers ────────────────────────────────────────────────────
// Every entity read from smartDb must be coerced to its declared shape before
// it reaches state. Legacy/malformed rows (missing fields, wrong types) are a
// real, recurring risk in this codebase's MySQL-JSON-blob storage — an
// un-normalized read crashed the Flashcards page earlier this session
// (`.length` on `undefined`). Every string gets a safe fallback, every array
// gets `Array.isArray` coercion, every number gets `Number(x) || 0`.
function normalizeMission(r: Record<string, any>): Mission {
  return {
    id: r.id, uid: r.uid ?? "",
    curriculumId: r.curriculumId ?? "", termId: r.termId ?? "", unitId: r.unitId ?? "", weekId: r.weekId ?? "",
    grade: r.grade ?? "", subject: r.subject ?? "",
    title: r.title ?? "Untitled Mission",
    narrative: r.narrative ?? "",
    narrativeTheme: ["space", "detective", "time-travel", "adventure", "default"].includes(r.narrativeTheme) ? r.narrativeTheme : "default",
    questions: Array.isArray(r.questions) ? r.questions.map((q: any, i: number) => ({
      id: q?.id ?? `q-${i}`,
      question: q?.question ?? "",
      options: Array.isArray(q?.options) ? q.options : [],
      correctOptionIndex: Number.isInteger(q?.correctOptionIndex) ? q.correctOptionIndex : 0,
      explanation: q?.explanation ?? undefined,
    })) : [],
    xpReward: Number(r.xpReward) || 50,
    coinReward: Number(r.coinReward) || 10,
    housePointsReward: Number(r.housePointsReward) || 5,
    status: r.status === "published" ? "published" : "draft",
    createdAt: r.createdAt ?? "", updatedAt: r.updatedAt ?? r.createdAt ?? "",
  };
}
function normalizeAttempt(r: Record<string, any>): MissionAttempt {
  return {
    id: r.id, uid: r.uid ?? "", missionId: r.missionId ?? "", studentId: r.studentId ?? "",
    answers: Array.isArray(r.answers) ? r.answers : [],
    score: Number(r.score) || 0, passed: !!r.passed,
    xpAwarded: Number(r.xpAwarded) || 0, coinsAwarded: Number(r.coinsAwarded) || 0, housePointsAwarded: Number(r.housePointsAwarded) || 0,
    completedAt: r.completedAt ?? "",
  };
}
function normalizeTransaction(r: Record<string, any>): WalletTransaction {
  return {
    id: r.id, uid: r.uid ?? "", studentId: r.studentId ?? "",
    type: r.type === "spend" ? "spend" : "earn",
    source: ["mission", "olympics", "shop", "bonus"].includes(r.source) ? r.source : "bonus",
    refId: r.refId ?? undefined,
    amount: Number(r.amount) || 0, balanceAfter: Number(r.balanceAfter) || 0,
    note: r.note ?? "", createdAt: r.createdAt ?? "",
  };
}
function normalizeShopItem(r: Record<string, any>): ShopItem {
  return {
    id: r.id, uid: r.uid ?? "", name: r.name ?? "Item",
    category: ["avatar-frame", "avatar-badge", "title", "theme-color"].includes(r.category) ? r.category : "avatar-badge",
    cost: Number(r.cost) || 0, assetRef: r.assetRef ?? "",
  };
}
function normalizeInventoryItem(r: Record<string, any>): StudentInventoryItem {
  return {
    id: r.id, uid: r.uid ?? "", studentId: r.studentId ?? "", shopItemId: r.shopItemId ?? "",
    equipped: !!r.equipped, acquiredAt: r.acquiredAt ?? "",
  };
}
function normalizeHouse(r: Record<string, any>): House {
  return { id: r.id, uid: r.uid ?? "", name: r.name ?? "House", colorHex: r.colorHex ?? "#8b5cf6", icon: r.icon ?? "Shield" };
}
function normalizeMembership(r: Record<string, any>): HouseMembership {
  return { id: r.id, uid: r.uid ?? "", studentId: r.studentId ?? "", houseId: r.houseId ?? "", assignedAt: r.assignedAt ?? "" };
}
function normalizeLedgerEntry(r: Record<string, any>): HousePointsLedgerEntry {
  return {
    id: r.id, uid: r.uid ?? "", houseId: r.houseId ?? "", studentId: r.studentId ?? "",
    points: Number(r.points) || 0,
    source: r.source === "olympics" ? "olympics" : "mission",
    refId: r.refId ?? "", createdAt: r.createdAt ?? "",
  };
}

function stamp(): string {
  // Date.now()/new Date() are unavailable in some sandboxed contexts this app
  // runs in — use the ISO string form consistently with the rest of the
  // codebase's smartDb writes (see FlashCardContext.addSet).
  return new Date().toISOString();
}

export const LearningUniverseProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  // Guards the one-time shop/house seed below against double-firing — React StrictMode
  // double-invokes effects in dev, and two overlapping fetchAll() calls (e.g. a fast
  // reload before the first seed write lands) would otherwise both see an empty list
  // and each insert a full duplicate set. This ref makes "seed at most once per mount"
  // hold even when fetchAll runs twice before either write resolves.
  const seededRef = useRef(false);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [attempts, setAttempts] = useState<MissionAttempt[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [inventory, setInventory] = useState<StudentInventoryItem[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [memberships, setMemberships] = useState<HouseMembership[]>([]);
  const [housePointsLedger, setHousePointsLedger] = useState<HousePointsLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // uid here is "who was logged in when this row was written" (an admin
  // authoring a Mission/ShopItem/House, or a student submitting their own
  // attempt) — never "who's allowed to see it". Every consumer below
  // (getWalletBalance, getStudentXp, getHouseStandings, getStudentHouse,
  // hasPassedMission) already filters the full list by the real per-student
  // key `studentId`, so uid-scoping this fetch only ever threw away rows
  // those helpers needed — e.g. a student fetching with their own uid would
  // see zero Missions/ShopItems/Houses, since those were authored by an
  // admin's different uid.
  const fetchAll = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const [m, a, t, si, inv, h, hm, hpl] = await Promise.all([
        smartDb.getAll("Mission", undefined),
        smartDb.getAll("MissionAttempt", undefined),
        smartDb.getAll("WalletTransaction", undefined),
        smartDb.getAll("ShopItem", undefined),
        smartDb.getAll("StudentInventoryItem", undefined),
        smartDb.getAll("House", undefined),
        smartDb.getAll("HouseMembership", undefined),
        smartDb.getAll("HousePointsLedgerEntry", undefined),
      ]);
      setMissions((m || []).map(normalizeMission));
      setAttempts((a || []).map(normalizeAttempt));
      setTransactions((t || []).map(normalizeTransaction));
      setShopItems((si || []).map(normalizeShopItem));
      setInventory((inv || []).map(normalizeInventoryItem));
      setHouses((h || []).map(normalizeHouse));
      setMemberships((hm || []).map(normalizeMembership));
      setHousePointsLedger((hpl || []).map(normalizeLedgerEntry));

      // Seed-if-empty (same idiom as src/pages/academics/Achievements.tsx):
      // shop items and houses are static content this school needs at least
      // once — seed only when genuinely empty, never overwrite real data.
      // seededRef prevents two overlapping fetchAll() calls from both seeding.
      if (!seededRef.current) {
        seededRef.current = true;
        if ((si || []).length === 0) {
          const created = await Promise.all(
            LEARNING_UNIVERSE_SHOP_SEED.map(item => smartDb.create("ShopItem", { ...item, uid: user.uid }))
          );
          setShopItems(created.map(normalizeShopItem));
        }
        if ((h || []).length === 0) {
          const created = await Promise.all(
            LEARNING_UNIVERSE_HOUSE_SEED.map(house => smartDb.create("House", { ...house, uid: user.uid }))
          );
          setHouses(created.map(normalizeHouse));
        }
      }
    } catch (error) {
      console.error("Error fetching Learning Universe data:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Derived helpers — always computed from the ledger, never stored ───────
  const getWalletBalance = useCallback((studentId: string) => {
    return transactions
      .filter(t => t.studentId === studentId)
      .reduce((sum, t) => sum + (t.type === "earn" ? t.amount : -t.amount), 0);
  }, [transactions]);

  const getStudentXp = useCallback((studentId: string) => {
    return attempts.filter(a => a.studentId === studentId).reduce((sum, a) => sum + a.xpAwarded, 0);
  }, [attempts]);

  const getHouseStandings = useCallback((): HouseStanding[] => {
    return houses.map(house => {
      const entries = housePointsLedger.filter(e => e.houseId === house.id);
      const memberIds = new Set(memberships.filter(m => m.houseId === house.id).map(m => m.studentId));
      return { house, totalPoints: entries.reduce((s, e) => s + e.points, 0), memberCount: memberIds.size };
    }).sort((a, b) => b.totalPoints - a.totalPoints);
  }, [houses, housePointsLedger, memberships]);

  const getStudentHouse = useCallback((studentId: string) => {
    const m = memberships.find(x => x.studentId === studentId);
    return m ? houses.find(h => h.id === m.houseId) : undefined;
  }, [memberships, houses]);

  const hasPassedMission = useCallback((missionId: string, studentId: string) => {
    return attempts.some(a => a.missionId === missionId && a.studentId === studentId && a.passed);
  }, [attempts]);

  // ── Mission CRUD ────────────────────────────────────────────────────────
  const createMission = useCallback(async (mission: Omit<Mission, "id" | "createdAt" | "updatedAt">) => {
    if (!user) return undefined;
    try {
      const now = stamp();
      const result = await smartDb.create("Mission", { ...mission, uid: user.uid, createdAt: now, updatedAt: now });
      const normalized = normalizeMission(result);
      setMissions(prev => [...prev, normalized]);
      return normalized;
    } catch (error) {
      console.error("Error creating mission:", error);
      return undefined;
    }
  }, [user]);

  const updateMission = useCallback(async (id: string, updates: Partial<Mission>) => {
    try {
      await smartDb.update("Mission", id, { ...updates, updatedAt: stamp() });
      await fetchAll();
    } catch (error) {
      console.error("Error updating mission:", error);
    }
  }, [fetchAll]);

  const deleteMission = useCallback(async (id: string) => {
    try {
      await smartDb.delete("Mission", id);
      setMissions(prev => prev.filter(m => m.id !== id));
    } catch (error) {
      console.error("Error deleting mission:", error);
    }
  }, []);

  // ── The single completion event every subsystem reacts to ─────────────
  const submitMissionAttempt = useCallback(async (missionId: string, studentId: string, answers: number[]): Promise<MissionAttempt> => {
    if (!user) throw new Error("Not authenticated");
    const mission = missions.find(m => m.id === missionId);
    if (!mission) throw new Error("Mission not found");

    const total = mission.questions.length || 1;
    const correctCount = mission.questions.reduce((acc, q, i) => acc + (answers[i] === q.correctOptionIndex ? 1 : 0), 0);
    const score = Math.round((correctCount / total) * 100);
    const passed = score >= 60;
    const xpAwarded = passed ? mission.xpReward : Math.round(mission.xpReward * 0.2);
    const coinsAwarded = passed ? mission.coinReward : 0;
    const housePointsAwarded = passed ? mission.housePointsReward : 0;
    const now = stamp();

    const attemptResult = await smartDb.create("MissionAttempt", {
      uid: user.uid, missionId, studentId, answers, score, passed,
      xpAwarded, coinsAwarded, housePointsAwarded, completedAt: now,
    });
    const attempt = normalizeAttempt(attemptResult);
    setAttempts(prev => [...prev, attempt]);

    if (coinsAwarded > 0) {
      const balanceAfter = getWalletBalance(studentId) + coinsAwarded;
      const txResult = await smartDb.create("WalletTransaction", {
        uid: user.uid, studentId, type: "earn", source: "mission", refId: missionId,
        amount: coinsAwarded, balanceAfter, note: `Completed mission: ${mission.title}`, createdAt: now,
      });
      setTransactions(prev => [...prev, normalizeTransaction(txResult)]);
    }

    if (housePointsAwarded > 0) {
      const house = getStudentHouse(studentId);
      if (house) {
        const ledgerResult = await smartDb.create("HousePointsLedgerEntry", {
          uid: user.uid, houseId: house.id, studentId, points: housePointsAwarded,
          source: "mission", refId: missionId, createdAt: now,
        });
        setHousePointsLedger(prev => [...prev, normalizeLedgerEntry(ledgerResult)]);
      }
    }

    return attempt;
  }, [user, missions, getWalletBalance, getStudentHouse]);

  // ── Olympics payout — same mechanism, source-tagged 'olympics' ────────
  const awardOlympicsCompletion = useCallback(async (studentId: string, subject: string, score: number, refId: string) => {
    if (!user) return;
    const coinsAwarded = Math.round((score / 100) * 20);
    const housePointsAwarded = Math.round((score / 100) * 10);
    const now = stamp();

    if (coinsAwarded > 0) {
      const balanceAfter = getWalletBalance(studentId) + coinsAwarded;
      const txResult = await smartDb.create("WalletTransaction", {
        uid: user.uid, studentId, type: "earn", source: "olympics", refId,
        amount: coinsAwarded, balanceAfter, note: `${subject} Classroom Olympics`, createdAt: now,
      });
      setTransactions(prev => [...prev, normalizeTransaction(txResult)]);
    }
    if (housePointsAwarded > 0) {
      const house = getStudentHouse(studentId);
      if (house) {
        const ledgerResult = await smartDb.create("HousePointsLedgerEntry", {
          uid: user.uid, houseId: house.id, studentId, points: housePointsAwarded,
          source: "olympics", refId, createdAt: now,
        });
        setHousePointsLedger(prev => [...prev, normalizeLedgerEntry(ledgerResult)]);
      }
    }
  }, [user, getWalletBalance, getStudentHouse]);

  // ── House assignment — balance-seeking, deterministic ───────────────────
  const assignHouseIfMissing = useCallback(async (studentId: string) => {
    if (!user) return;
    if (memberships.some(m => m.studentId === studentId)) return;
    if (houses.length === 0) return; // seed hasn't landed yet — MissionMap re-triggers on next mount
    const counts = houses.map(h => ({ house: h, count: memberships.filter(m => m.houseId === h.id).length }));
    counts.sort((a, b) => a.count - b.count);
    const target = counts[0].house;
    const result = await smartDb.create("HouseMembership", { uid: user.uid, studentId, houseId: target.id, assignedAt: stamp() });
    setMemberships(prev => [...prev, normalizeMembership(result)]);
  }, [user, memberships, houses]);

  // ── Wallet spend flow ────────────────────────────────────────────────────
  const purchaseShopItem = useCallback(async (studentId: string, shopItemId: string) => {
    if (!user) return { ok: false, error: "Not authenticated" };
    const item = shopItems.find(s => s.id === shopItemId);
    if (!item) return { ok: false, error: "Item not found" };
    const balance = getWalletBalance(studentId);
    if (balance < item.cost) return { ok: false, error: "Not enough coins" };

    const now = stamp();
    const balanceAfter = balance - item.cost;
    const txResult = await smartDb.create("WalletTransaction", {
      uid: user.uid, studentId, type: "spend", source: "shop", refId: shopItemId,
      amount: item.cost, balanceAfter, note: `Purchased: ${item.name}`, createdAt: now,
    });
    setTransactions(prev => [...prev, normalizeTransaction(txResult)]);

    const invResult = await smartDb.create("StudentInventoryItem", {
      uid: user.uid, studentId, shopItemId, equipped: false, acquiredAt: now,
    });
    setInventory(prev => [...prev, normalizeInventoryItem(invResult)]);
    return { ok: true };
  }, [user, shopItems, getWalletBalance]);

  const equipInventoryItem = useCallback(async (studentId: string, inventoryItemId: string) => {
    const item = inventory.find(i => i.id === inventoryItemId);
    if (!item) return;
    // Unequip other items in the same category (frames/badges/titles/themes are exclusive slots).
    const shopItem = shopItems.find(s => s.id === item.shopItemId);
    if (!shopItem) return;
    const sameCategory = inventory.filter(i =>
      i.studentId === studentId && shopItems.find(s => s.id === i.shopItemId)?.category === shopItem.category
    );
    await Promise.all(sameCategory.map(i => smartDb.update("StudentInventoryItem", i.id, { equipped: i.id === inventoryItemId })));
    setInventory(prev => prev.map(i =>
      sameCategory.some(sc => sc.id === i.id) ? { ...i, equipped: i.id === inventoryItemId } : i
    ));
  }, [inventory, shopItems]);

  const value: LearningUniverseContextType = {
    missions, attempts, transactions, shopItems, inventory, houses, memberships, housePointsLedger, loading,
    getWalletBalance, getStudentXp, getHouseStandings, getStudentHouse, hasPassedMission,
    createMission, updateMission, deleteMission,
    submitMissionAttempt, awardOlympicsCompletion, assignHouseIfMissing,
    purchaseShopItem, equipInventoryItem,
  };

  return <LearningUniverseContext.Provider value={value}>{children}</LearningUniverseContext.Provider>;
};
