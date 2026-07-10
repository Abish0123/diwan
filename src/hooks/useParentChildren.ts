import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { smartDb } from "@/lib/localDb";

export interface ParentChild {
  id: string;
  name: string;
  grade: string;
  section: string;
  rollNo: string;
  admissionNo: string;
  gender: string;
  dob: string;
  house: string;
  bloodGroup: string;
  nationality: string;
  _realStudent?: boolean;
}

// Stable reference for the "not loaded yet" case — `data: children = []` would
// otherwise create a BRAND NEW array every render while the query is pending,
// and useNotifications.ts (which calls this hook unconditionally for every
// role, not just parents) puts that array directly into several useEffect/
// useCallback dependency arrays. An unstable reference there tears down and
// re-fires those effects — including a polling effect that ends in a
// setNotifications() call — on every single render, which (especially over a
// fast local network) can cascade into a "Maximum update depth exceeded"
// render loop that freezes the tab within seconds of any page mounting this
// hook, well before the query has even resolved.
const EMPTY_CHILDREN: ParentChild[] = [];

function mapStudentToChild(s: any): ParentChild {
  return {
    id: s.id,
    name: s.name || "Unknown",
    grade: s.grade || s.class || "",
    section: s.section || "",
    rollNo: s.rollNo || s.studentId || s.rollNumber || "—",
    admissionNo: s.admissionNo || s.admissionNumber || s.studentId || "—",
    gender: s.gender || "—",
    dob: s.dateOfBirth || s.dob || "—",
    house: s.house || s.houseColor || "—",
    bloodGroup: s.bloodGroup || "—",
    nationality: s.nationality || "—",
    _realStudent: true,
  };
}

export function useParentChildren() {
  const { user, role } = useAuth();
  const storageKey = `parent_selected_child_${user?.uid || "default"}`;
  const email = (user?.email || "").toLowerCase().trim();

  const [selectedId, setSelectedId] = useState<string>(() => {
    try { return localStorage.getItem(storageKey) || ""; }
    catch { return ""; }
  });

  // This hook mounts on ~20 parent pages plus the persistent ChildSwitcher
  // header and a couple of global hooks — every mount used to independently
  // fetch and client-filter the ENTIRE students table. react-query shares
  // one fetch (and the filtered result) across every call site instead of
  // re-scanning the full roster on every page navigation.
  const { data: children = EMPTY_CHILDREN, isLoading: loading } = useQuery({
    queryKey: ["parent-children", email],
    queryFn: () => smartDb.getAll("Student").then((students: any[]) =>
      (students || []).filter((s: any) =>
        (s.fatherEmail   && s.fatherEmail.toLowerCase().trim()   === email) ||
        (s.motherEmail   && s.motherEmail.toLowerCase().trim()   === email) ||
        (s.guardianEmail && s.guardianEmail.toLowerCase().trim() === email)
      ).map(mapStudentToChild)
    ),
    enabled: !!email && role === "parent",
  });

  const selected = useMemo(
    () => children.find(c => c.id === selectedId) || children[0],
    [children, selectedId]
  );

  const selectChild = useCallback((id: string) => {
    setSelectedId(id);
    try { localStorage.setItem(storageKey, id); } catch {}
  }, [storageKey]);

  return { children, selected, selectChild, loading };
}
