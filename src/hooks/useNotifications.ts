import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import socket from "@/lib/socket";
import { useAuth } from "@/hooks/useAuth";
import { getRole } from "@/lib/roles";
import { useParentChildren } from "@/hooks/useParentChildren";
import { useStudents } from "@/contexts/StudentContext";
import { smartDb } from "@/lib/localDb";
import { notificationReadRepository } from "@/repositories/NotificationReadRepository";

// Browsers create a new AudioContext in "suspended" state until a user
// gesture unlocks audio on the page — a fresh context per call (the old
// approach) meant the sound silently never played. Reusing one context and
// resuming it (both here and via a one-time page-wide gesture listener
// below) is what actually makes the sound audible.
let sharedAudioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioCtx) sharedAudioCtx = new Ctor();
  if (sharedAudioCtx.state === "suspended") sharedAudioCtx.resume().catch(() => {});
  return sharedAudioCtx;
}

// Web Audio API notification sound generator
function playNotificationSound(soundType = "chime") {
  try {
    if (soundType === "none") return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);

    if (soundType === "beep") {
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } else if (soundType === "chime") {
      [523, 659, 784].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.18);
      });
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    } else if (soundType === "bell") {
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = "sine";
      osc.frequency.setValueAtTime(1047, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(523, ctx.currentTime + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.8);
    } else if (soundType === "ping") {
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = "sine";
      osc.frequency.setValueAtTime(1318, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } else if (soundType === "ding-dong") {
      [587, 440].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.25);
        osc.start(ctx.currentTime + i * 0.25);
        osc.stop(ctx.currentTime + i * 0.25 + 0.3);
      });
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    }
  } catch {
    // Audio not supported — silently skip
  }
}

export { playNotificationSound };

export interface AppNotification {
  id: string;
  type: string;
  entity: string;
  category: "student" | "staff" | "finance" | "admission" | "general";
  title: string;
  time: string;
  read: boolean;
  audienceRole?: string;
  recipientName?: string;
  recipientUid?: string;
  message?: string;
  studentId?: string;
  threadId?: string;
  examId?: string;
  grade?: string;
  section?: string;
  /** Deep link to the record this notification is about, e.g. "/finance/fees/INV-123".
   *  When present, clicking the notification goes straight here instead of the
   *  generic entity/type routing guesswork in notificationRouting.ts. */
  redirectUrl?: string;
  /** Defaults to "normal" when absent — see isImportantForAdmin() below, which
   *  is the only place this currently gates delivery (Admin/Super Admin only
   *  see high/critical role-broadcast notifications; everyone else is
   *  unaffected). Not yet set by every creation call site — those default. */
  priority?: "low" | "normal" | "high" | "critical";
}

// Strip "Mr./Mrs./Ms./Dr." titles for tolerant name comparison
function normName(s?: string) {
  return (s || "").toLowerCase().replace(/^(mr\.|mrs\.|ms\.|dr\.)\s*/i, "").trim();
}

const VALID_CATEGORIES = ["student", "staff", "finance", "admission", "general"];

function normalize(n: any): AppNotification {
  return {
    id: String(n.id),
    type: n.type || "update",
    entity: n.entity || "general",
    category: VALID_CATEGORIES.includes(n.category) ? n.category : "general",
    title: n.title || "Notification",
    time: n.time || n.createdAt || new Date().toISOString(),
    read: false,
    audienceRole: n.audienceRole,
    recipientName: n.recipientName,
    recipientUid: n.recipientUid,
    message: n.message,
    studentId: n.studentId,
    threadId: n.threadId,
    examId: n.examId,
    grade: n.grade,
    section: n.section,
    redirectUrl: n.redirectUrl,
    priority: n.priority || "normal",
  };
}

function ts(n: AppNotification) {
  const t = new Date(n.time).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Unified notification feed.
 *
 * SINGLE SOURCE OF TRUTH: All notifications are stored in a shared `Map` keyed
 * by id so the bell dropdown and the full page always render the exact same list.
 *
 * Two delivery paths both write to the same Map:
 *   1. socket.io — instant live events
 *   2. DB polling — catches notifications saved by other processes
 *
 * Both paths apply identical isForMe filtering before storing anything.
 */
export function useNotifications() {
  const { user, role } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevUnreadRef = useRef(0);

  // Browser audio policy blocks sound until the page has seen a user gesture.
  // Unlock (create + resume) the shared AudioContext on the very first
  // click/keydown anywhere on the page so it's ready by the time a real
  // notification arrives, instead of relying on the notification's own event
  // (which isn't a user gesture and won't reliably unlock audio).
  useEffect(() => {
    const unlock = () => { getAudioContext(); };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Called unconditionally to satisfy rules-of-hooks; result only consulted
  // below when the caller's role is "parent" (cheap + cached internally).
  const { children: myChildren } = useParentChildren();
  // A primitive (string) dependency key derived from myChildren's actual
  // content — used in place of the array itself in effect/callback
  // dependency arrays below so a fresh-but-equivalent array reference
  // (e.g. from a query refetch) doesn't spuriously tear down and recreate
  // sockets/effects that don't actually need to change.
  const myChildrenKey = useMemo(() => myChildren.map(c => c.id).sort().join(","), [myChildren]);

  // StudentContext is already loaded app-wide by the time this hook runs (it's
  // one of the top-level providers), so this is a context read, not an extra
  // fetch — used below to scope grade/section-broadcast notifications (e.g.
  // "new subject teacher assigned") to the student they're actually about,
  // instead of every student in the school seeing every other class's alerts.
  const { students } = useStudents();

  const myName = (user as any)?.displayName || (user as any)?.name || "";
  const myUid = (user as any)?.uid || "";
  const myEmail = (user as any)?.email || "";

  const myGradeSection = useMemo(() => {
    if (role !== "student" || !students?.length) return null;
    const me = students.find((s: any) =>
      (myEmail && s.email === myEmail) || (myName && s.name === myName)
    );
    return me ? { grade: normName(String((me as any).grade ?? "")), section: normName(String((me as any).section ?? "")) } : null;
  }, [role, students, myEmail, myName]);

  // Tell the server which socket.io rooms this connection belongs to, so the
  // server only ever emits notifications actually meant for it — re-sent on
  // every connect/reconnect since Socket.io room membership doesn't survive one.
  useEffect(() => {
    if (!myUid && !myEmail && !role) return;
    const identify = () => {
      socket.emit("identify", {
        uid: myUid || undefined,
        // Most student/parent notifications are targeted by email (recipientUid:
        // s.email in examStore.ts/reportCardStore.ts/feeReminderEngine.ts), since
        // that's how a real user is actually looked up — NOT by the DB row id
        // that ends up in `uid`. Without also joining the email-keyed room, live
        // socket delivery silently misses every one of those and the
        // notification only ever shows up via the next slow poll or a refresh.
        email: myEmail || undefined,
        role: role || undefined,
        grade: myGradeSection?.grade,
        section: myGradeSection?.section,
        childIds: role === "parent" ? myChildren.map(c => c.id) : undefined,
      });
    };
    identify();
    socket.on("connect", identify);
    return () => { socket.off("connect", identify); };
  }, [myUid, myEmail, role, myGradeSection, myChildrenKey]);

  // Single canonical store — Map<id, AppNotification>. Notification objects here
  // always carry read: false as a placeholder; the real value is computed live
  // in flush() from readByMe/bootstrapCutoff below, never baked in at ingest —
  // that's what lets read state come from an async per-user fetch without
  // needing to re-ingest anything once it resolves.
  const store = useRef<Map<string, AppNotification>>(new Map());

  // ── Per-user read tracking ──────────────────────────────────────────────
  // Read state used to live as a single `read` boolean on the notification row
  // itself — meaning if the notification was a broadcast (audienceRole/grade),
  // one recipient marking it read marked it read for every other recipient too.
  // This tracks read state per (notification, me) instead, backed by the
  // NotificationRead join table (one row per reader per notification).
  const readByMe = useRef<Set<string>>(new Set());
  // ms timestamp: any notification created at/before this is implicitly read
  // for me, without needing an explicit NotificationRead row for it. Set once
  // per account on its very first-ever load (see the bootstrap effect below)
  // so a migration/first-login doesn't flood someone with hundreds of
  // "unread" notifications that predate them ever using the feed.
  const bootstrapCutoff = useRef<number | null>(null);
  const bootstrapLoaded = useRef(false);
  const bootstrapped = useRef(false); // true once the first notification poll has landed

  const isReadByMe = useCallback((id: string, timeIso: string): boolean => {
    if (readByMe.current.has(id)) return true;
    if (bootstrapCutoff.current !== null) {
      const t = new Date(timeIso).getTime();
      if (Number.isFinite(t) && t <= bootstrapCutoff.current) return true;
    }
    return false;
  }, []);

  // Rebuild sorted array from store and push to state
  const flush = useCallback(() => {
    const sorted = Array.from(store.current.values())
      .map(n => ({ ...n, read: isReadByMe(n.id, n.time) }))
      .sort((a, b) => ts(b) - ts(a))
      .slice(0, 50);
    setNotifications(sorted);
    const newUnread = sorted.filter(n => !n.read).length;
    if (bootstrapped.current && bootstrapLoaded.current && newUnread > prevUnreadRef.current) {
      const soundPref = localStorage.getItem("sd_notification_sound") || "chime";
      playNotificationSound(soundPref);
    }
    prevUnreadRef.current = newUnread;
    setUnreadCount(newUnread);
  }, [isReadByMe]);

  // Load (or, on true first-ever login, create) this account's own read state.
  useEffect(() => {
    if (!myUid) return;
    let active = true;
    (async () => {
      try {
        const rows = await notificationReadRepository.findByUid(myUid);
        if (!active || !Array.isArray(rows)) return;
        const sentinelId = `nr_bootstrap_${myUid}`;
        const sentinel = rows.find(r => r.id === sentinelId);
        rows.forEach(r => {
          if (r.id !== sentinelId && r.notificationId) readByMe.current.add(String(r.notificationId));
        });
        if (sentinel?.cutoffTime) {
          bootstrapCutoff.current = new Date(sentinel.cutoffTime).getTime();
        } else {
          const cutoffTime = new Date().toISOString();
          bootstrapCutoff.current = new Date(cutoffTime).getTime();
          notificationReadRepository.create({ id: sentinelId, uid: myUid, cutoffTime }).catch(() => {});
        }
        bootstrapLoaded.current = true;
        flush(); // re-derive read state for anything ingested before this resolved
      } catch { /* non-fatal — worst case, read state stays session-local via readByMe writes below */ }
    })();
    return () => { active = false; };
  }, [myUid, flush]);

  // Admin's own inbox gets flooded fastest — every routine invoice-generated
  // confirmation, fee reminder receipt, and system "New X added" ping all
  // land there by default. Personally-targeted notifications (recipientUid
  // match, handled above this point) always get through regardless — this
  // only thins out the generic admin-role broadcasts and untargeted system
  // pings down to what actually needs an admin's attention.
  const ADMIN_TIER_ROLES = ["admin", "super_admin", "school_owner"];
  const isImportantEnoughForAdmin = (n: any): boolean => {
    const p = n.priority || "normal";
    return p === "high" || p === "critical";
  };

  // Is this notification meant for the current user?
  const isForMe = useCallback((n: any): boolean => {
    // Targeted by UID or email
    if (n.recipientUid) {
      return n.recipientUid === myUid || n.recipientUid === myEmail;
    }
    // Targeted by display name
    if (n.recipientName) {
      return normName(n.recipientName) === normName(myName);
    }
    // Audience role match
    if (n.audienceRole) {
      if (n.audienceRole === "all") return true;
      if (n.audienceRole === "teacher" && (role === "staff" || role === "teacher")) return true;
      if (n.audienceRole !== role) return false;
      if (ADMIN_TIER_ROLES.includes(role || "") && !isImportantEnoughForAdmin(n)) return false;
      // Parent-wide broadcasts must still be scoped to the caller's own
      // children when the notification is tied to a specific student —
      // otherwise every parent sees every other family's notifications.
      if (role === "parent" && n.studentId) {
        return myChildren.some(c => c.id === n.studentId);
      }
      // Student-wide broadcasts tied to a specific grade/section (e.g. "new
      // subject teacher assigned to Grade 5-B") must be scoped to students
      // actually in that grade/section — without this, every student in the
      // school saw every other class's teacher-assignment notifications.
      if (role === "student" && (n.recipientGrade || n.recipientSection) && myGradeSection) {
        if (n.recipientGrade && normName(String(n.recipientGrade)) !== myGradeSection.grade) return false;
        if (n.recipientSection && normName(String(n.recipientSection)) !== myGradeSection.section) return false;
        return true;
      }
      return true;
    }
    // Untargeted events (bus trips, DB audit logs, etc.) → full-access admin
    // tier only, and — same as above — only the important ones.
    if (getRole(role).full !== true) return false;
    return isImportantEnoughForAdmin(n);
  }, [myUid, myEmail, myName, role, myChildrenKey, myGradeSection]);

  // Request OS-level notification permission once, best-effort — silently
  // no-ops if the browser doesn't support it or the user already decided.
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Real WhatsApp-style desktop push: fire a native browser notification for
  // a freshly-arrived (not historical/bootstrap) chat message, but only when
  // the user isn't already looking at the thread it belongs to.
  const pushBrowserNotification = useCallback((n: AppNotification) => {
    if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
    if (n.type !== "chat_message") return;
    if (!document.hidden && window.location.pathname === "/communication/messages") return;
    try {
      const notif = new Notification(n.title, { body: n.message || "", tag: n.id });
      notif.onclick = () => {
        window.focus();
        if (window.location.pathname !== "/communication/messages") {
          window.location.href = "/communication/messages";
        }
        notif.close();
      };
    } catch { /* non-fatal — some browsers restrict this outside a user gesture */ }
  }, []);

  // In-app toast popup — separate from the desktop Notification above (which
  // only fires for chat messages and needs OS permission). This is the
  // always-available in-tab equivalent: a visible top-right toast for every
  // freshly-arrived notification (timetable published, exam results, etc.),
  // on top of the bell badge count, so an update is never silent.
  const toastNewNotification = useCallback((n: AppNotification) => {
    toast(n.title, { description: n.message || undefined, duration: 6000 });
  }, []);

  // Teacher Settings' per-category toggles (src/pages/teacher/TeacherSettings.tsx)
  // gate the live popup only, never the store/badge — the notification still
  // really happened and still counts as unread, this just decides whether it
  // interrupts with a toast/OS notification. Only applies to the teacher
  // portal (role "staff"); every other role is unaffected by this key.
  const shouldPopup = useCallback((n: AppNotification): boolean => {
    if (role !== "staff") return true;
    try {
      const raw = localStorage.getItem("sd_notification_prefs");
      if (!raw) return true;
      const p = JSON.parse(raw);
      if (p.push === false) return false;
      if (n.entity === "Attendance" && p.attendance === false) return false;
      if (n.entity === "PTMSession" && p.ptm === false) return false;
      if (n.type === "leave_status" && p.leave === false) return false;
      return true;
    } catch { return true; }
  }, [role]);

  // Ingest a batch of raw notification objects into the store. Read state is
  // NOT computed here — it's derived live in flush() from readByMe/bootstrapCutoff,
  // so it stays correct even if this fires before the per-user read fetch resolves.
  const ingest = useCallback((incoming: any[], isCatchup: boolean) => {
    let changed = false;
    for (const raw of incoming) {
      if (!raw?.id) continue;
      const id = String(raw.id);
      if (store.current.has(id)) continue; // already stored
      if (!isForMe(raw)) continue;
      const notif = normalize(raw);
      store.current.set(id, notif);
      // Only push a live popup for genuinely new events — catch-up polls (first
      // load, or a poll that's just re-syncing) must never re-alert for things
      // that already happened.
      if (!isCatchup && bootstrapped.current && shouldPopup(notif)) {
        pushBrowserNotification(notif);
        toastNewNotification(notif);
      }
      changed = true;
    }
    if (changed) flush();
  }, [isForMe, flush, pushBrowserNotification, toastNewNotification, shouldPopup]);

  // ── Path 1: socket.io live events ────────────────────────────────────────
  useEffect(() => {
    const handler = (data: any) => ingest([data], false);
    socket.on("notification", handler);
    return () => { socket.off("notification", handler); };
  }, [ingest]);

  // ── Path 2: DB polling ───────────────────────────────────────────────────
  // Now that delivery is room-targeted and reliable, polling only needs to be
  // a slow safety net while the socket is actually connected (5 min) — it
  // ramps up to a real fallback cadence (15 s) only while disconnected, when
  // it's the sole way notifications still arrive.
  // The for* params let the server filter to just this recipient's rows
  // server-side (see notificationIsForRecipient() in server.ts) — isForMe()
  // below still re-checks everything client-side too, as a defense-in-depth
  // backstop in case the server-side filter or these params are ever wrong.
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const params = new URLSearchParams();
        if (myUid) params.set("forUid", myUid);
        if (myEmail) params.set("forEmail", myEmail);
        if (myName) params.set("forName", myName);
        if (role) params.set("forRole", role);
        if (myGradeSection?.grade) params.set("forGrade", myGradeSection.grade);
        if (myGradeSection?.section) params.set("forSection", myGradeSection.section);
        if (role === "parent" && myChildren.length) params.set("forChildIds", myChildren.map(c => c.id).join(","));
        const qs = params.toString();
        const res = await fetch(`/api/data/notifications${qs ? `?${qs}` : ""}`);
        if (!res.ok || !active) return;
        const rows: any[] = await res.json();
        if (!Array.isArray(rows)) return;
        ingest(rows, !bootstrapped.current);
        bootstrapped.current = true;
      } catch { /* non-fatal */ }
    };
    const schedule = () => {
      if (!active) return;
      const delay = socket.connected ? 300_000 : 15_000;
      timer = setTimeout(async () => { await poll(); schedule(); }, delay);
    };
    poll();
    schedule();
    // A reconnect should trigger an immediate catch-up poll rather than
    // waiting out whatever delay was in flight when the connection dropped.
    const onConnect = () => poll();
    socket.on("connect", onConnect);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      socket.off("connect", onConnect);
    };
  }, [ingest, myUid, myEmail, myName, role, myGradeSection, myChildrenKey]);

  // Both of these write per-user NotificationRead rows — marking read/unread
  // only ever affects MY OWN read state, never the shared notification row, so
  // one recipient of a broadcast notification can never flip it (un)read for
  // every other recipient.
  const markAllRead = useCallback(() => {
    if (!myUid) return;
    const idsToPersist: string[] = [];
    store.current.forEach((n, id) => {
      if (!isReadByMe(id, n.time)) idsToPersist.push(id);
      readByMe.current.add(id);
    });
    flush();
    // Fire-and-forget persistence — the UI already reflects read state from the
    // in-memory update above, so a slow/failed write here shouldn't block anything.
    Promise.all(idsToPersist.map(id => {
      const rowId = `${id}_${myUid}`;
      return notificationReadRepository.create({ id: rowId, uid: myUid, notificationId: id, readAt: new Date().toISOString() }).catch(() => {});
    })).catch(() => {});
  }, [flush, isReadByMe, myUid]);

  const markRead = useCallback((id: string, read = true) => {
    if (read) readByMe.current.add(id); else readByMe.current.delete(id);
    flush();
    if (!myUid) return;
    const rowId = `${id}_${myUid}`;
    if (read) {
      notificationReadRepository.create({ id: rowId, uid: myUid, notificationId: id, readAt: new Date().toISOString() }).catch(() => {});
    } else {
      // Marking a notification unread that predates this account's bootstrap
      // cutoff has no explicit row to delete (it was implicitly read) — it'll
      // stay read. Known, acceptable limitation for very old historical items.
      notificationReadRepository.delete(rowId).catch(() => {});
    }
  }, [flush, myUid]);

  // Real deletes — these remove the row from the shared `notifications` table,
  // not just this browser's view of it (unlike the old local-only "dismiss").
  // Removed from the in-memory store immediately so the UI updates without
  // waiting on the network round trip; each DB delete is fire-and-forget
  // since the local removal is already the source of truth for this tab.
  const deleteNotification = useCallback((id: string) => {
    store.current.delete(id);
    flush();
    smartDb.delete("Notification", id).catch(() => {});
  }, [flush]);

  const deleteNotifications = useCallback((ids: string[]) => {
    if (!ids.length) return;
    ids.forEach(id => store.current.delete(id));
    flush();
    Promise.all(ids.map(id => smartDb.delete("Notification", id).catch(() => {}))).catch(() => {});
  }, [flush]);

  return { notifications, unreadCount, markAllRead, markRead, deleteNotification, deleteNotifications };
}
