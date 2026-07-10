/* eslint-disable react-refresh/only-export-components */
// ── Multi-branch data isolation ─────────────────────────────────────────────
// Real infrastructure for scoping data by campus/branch — previously
// BranchManagement.tsx had real branch CRUD but nothing else in the app knew
// a "current branch" existed, so selecting a branch there had zero effect on
// any other module's data (not real multi-tenancy, just a standalone list).
//
// This context is the single source of truth for "which branch is the user
// currently working in", persisted per-browser so it survives reloads. Pages
// that need branch-scoped data pass `activeBranchId` into
// `smartDb.getAll(entity, uid, { branchId: activeBranchId })` — the generic
// backend query-param filter (server.ts's GET /api/data/:entity handler)
// already matches any field on a record, so no schema change was needed to
// support this once records carry a `branchId` field.
//
// Honesty note: the real seeded dataset behind this app is a single school
// with no existing branch-tagged records. Rather than fabricate a second
// branch's worth of students/staff/invoices just to produce a demo, this
// wires the real mechanism through end-to-end (persisted selection, generic
// filter support, tagging new Student records with the active branch on
// creation — see AddStudentDialog) so it isolates correctly the moment a
// school actually adds a second branch and starts assigning students to it.
import { createContext, useContext, useEffect, useMemo, useState, ReactNode, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";

export interface Branch {
  id: string;
  name: string;
  city?: string;
  status?: string;
}

interface BranchContextType {
  branches: Branch[];
  activeBranchId: string | null;
  activeBranch: Branch | null;
  setActiveBranchId: (id: string | null) => void;
  loading: boolean;
}

const STORAGE_KEY = "sd_active_branch_id";

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export const BranchProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchIdState] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setBranches([]); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const data = (await smartDb.getAll("Branch", undefined)) as Branch[];
        if (!cancelled) setBranches(data || []);
      } catch (error) {
        console.error("Error loading branches:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Drop a stale selection if that branch was deleted, or if the school only
  // has a single branch (nothing meaningful to scope by yet).
  useEffect(() => {
    if (!activeBranchId) return;
    if (branches.length <= 1 || !branches.some(b => b.id === activeBranchId)) {
      setActiveBranchIdState(null);
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
  }, [branches, activeBranchId]);

  const setActiveBranchId = useCallback((id: string | null) => {
    setActiveBranchIdState(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }, []);

  const activeBranch = useMemo(
    () => branches.find(b => b.id === activeBranchId) || null,
    [branches, activeBranchId]
  );

  const value = useMemo(
    () => ({ branches, activeBranchId, activeBranch, setActiveBranchId, loading }),
    [branches, activeBranchId, activeBranch, setActiveBranchId, loading]
  );

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
};

export const useBranch = () => {
  const context = useContext(BranchContext);
  if (context === undefined) {
    throw new Error("useBranch must be used within a BranchProvider");
  }
  return context;
};
