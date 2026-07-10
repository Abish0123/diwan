import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { smartDb } from "@/lib/localDb";
import { userRepository } from "@/repositories/UserRepository";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationsContext } from "@/contexts/NotificationsContext";
import { getRole } from "@/lib/roles";
import { canMessage, canMessageAny, messagingTier, TIER_LABEL } from "@/lib/messagingPermissions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Search, Plus, Send, Paperclip, Info, Check, CheckCheck, User, MessageSquare,
  Users, Star, Archive, ArchiveRestore, X, Pin, FileText, Mail, Phone, Shield,
  Bell, ChevronLeft, Mic, Square, Play, Pause, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

// ── Real data model ──────────────────────────────────────────────────────────
// ChatThread   : the conversation itself, shared by every participant — a
//                thread only exists once and both sides see the same record
//                (unlike the old uid-scoped mailbox where each user had their
//                own private, disconnected copy of "their" threads).
// ChatMessage  : one message in a thread, authored by a real participant uid.
// ChatThreadState : per-user state (archived, last-read timestamp) so
//                archiving/read-receipts never leak across participants.

interface Participant { uid: string; name: string; role: string; email: string; }
interface Attachment { name: string; size: number; type: string; }

interface ThreadRow {
  id: string;
  type: "direct" | "group";
  name: string;
  participants: Participant[];
  createdBy: string;
  createdAt: string;
  lastMessage?: string;
  lastMessageAt?: string;
  lastSenderUid?: string;
}

interface VoiceNote { dataUrl: string; durationSec: number; }

interface MessageRow {
  id: string;
  threadId: string;
  senderUid: string;
  senderName: string;
  text: string;
  attachments?: Attachment[];
  voiceNote?: VoiceNote;
  createdAt: string;
  starredBy?: string[];
}

interface ThreadStateRow {
  id: string; threadId: string; uid: string;
  archived?: boolean; lastReadAt?: string;
}

interface ContactRow { uid: string; name: string; email: string; role: string; }

type FilterTab = "all" | "unread" | "groups" | "parents" | "teachers" | "students" | "archived" | "starred";

function initials(name: string) {
  return (name || "?").trim().split(/\s+/).map(w => w[0] || "").slice(0, 2).join("").toUpperCase();
}
function fmtTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtListTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return fmtTime(iso);
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
function dateLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}
function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const Messages = () => {
  const { user, role } = useAuth();
  const { notifications: liveNotifications, markRead: markNotificationRead } = useNotificationsContext();
  const myUid = user?.uid || "";
  const myName = (user as any)?.displayName || (user as any)?.name || user?.email || "Me";
  const myEmail = (user?.email || "").toLowerCase().trim();
  const location = useLocation();
  const navigate = useNavigate();

  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [threadStates, setThreadStates] = useState<ThreadStateRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [showInfo, setShowInfo] = useState(false);

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState("");
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [groupMembers, setGroupMembers] = useState<ContactRow[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // ── Voice notes — real mic capture via MediaRecorder, not a fake stub.
  // Recordings are short (capped at MAX_VOICE_NOTE_SEC), so storing the audio
  // as a base64 data URL directly on the ChatMessage row is viable — both
  // participants read the same row, so playback is real on both sides.
  const MAX_VOICE_NOTE_SEC = 120;
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [voicePreview, setVoicePreview] = useState<VoiceNote | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordStreamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  const startVoiceRecording = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Voice recording isn't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds(prev => {
          if (prev + 1 >= MAX_VOICE_NOTE_SEC) { stopVoiceRecording(); return prev; }
          return prev + 1;
        });
      }, 1000);
    } catch {
      toast.error("Microphone access was denied — allow it in your browser settings to record a voice note.");
    }
  };

  const stopVoiceRecording = () => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    const durationSec = recordSeconds;
    recorder.onstop = async () => {
      recordStreamRef.current?.getTracks().forEach(t => t.stop());
      const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || "audio/webm" });
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      setVoicePreview({ dataUrl, durationSec: durationSec || 1 });
    };
    recorder.stop();
    setIsRecording(false);
  };

  const cancelVoiceRecording = () => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => recordStreamRef.current?.getTracks().forEach(t => t.stop());
      recorder.stop();
    }
    setIsRecording(false);
    setRecordSeconds(0);
  };

  const sendVoiceNote = async () => {
    if (!voicePreview) return;
    await sendMessage(undefined, voicePreview);
    setVoicePreview(null);
    setRecordSeconds(0);
  };

  const discardVoicePreview = () => setVoicePreview(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [allThreads, allMessages, allStates, usersRes, allStudents, allNotifs] = await Promise.all([
        (smartDb.getAll("ChatThread") || []) as unknown as Promise<ThreadRow[]>,
        (smartDb.getAll("ChatMessage") || []) as unknown as Promise<MessageRow[]>,
        (smartDb.getAll("ChatThreadState") || []) as unknown as Promise<ThreadStateRow[]>,
        userRepository.getAll().catch(() => []),
        (smartDb.getAll("Student") || []) as unknown as Promise<any[]>,
        (smartDb.getAll("Notification") || []) as unknown as Promise<any[]>,
      ]);

      const mine = (allThreads || []).filter(t => (t.participants || []).some(p => p.uid === myUid));
      setThreads(mine);
      const myThreadIds = new Set(mine.map(t => t.id));
      setMessages((allMessages || []).filter(m => myThreadIds.has(m.threadId)));
      setThreadStates((allStates || []).filter(s => myThreadIds.has(s.threadId)));
      setStudents(allStudents || []);
      setNotifications(allNotifs || []);

      // Identity note: /api/auth/login always mints the session uid from the
      // DB row's `id` (see server.ts), never the row's own `uid` JSON field —
      // some seed records carry a different, stale `uid` value. Contacts must
      // key off `id` too, or a started thread silently never reaches the
      // other side because their real session uid doesn't match.
      const contactRows: ContactRow[] = ((usersRes || []) as any[])
        .map(u => ({ uid: u.id || u.uid, name: u.name || u.email || "Unknown", email: (u.email || "").toLowerCase(), role: u.role || "" }))
        .filter(c => c.uid && c.uid !== myUid && canMessage(role, c.role));
      // De-dupe by uid — the accounts API can return the same account twice across roles/aliases.
      const seen = new Set<string>();
      setContacts(contactRows.filter(c => (seen.has(c.uid) ? false : (seen.add(c.uid), true))));
    } catch {
      setThreads([]); setMessages([]); setThreadStates([]); setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [myUid, role]);

  useEffect(() => { load(); }, [load]);

  // Deep-link support: another page (e.g. Alumni "Send Message") can navigate
  // here with { recipientEmail } — resolve it to a REAL account and open/create
  // a real shared thread, rather than a one-sided fake contact only we can see.
  useEffect(() => {
    const incoming = location.state as { recipientEmail?: string; recipientName?: string } | null;
    if (!incoming?.recipientEmail || loading) return;
    const target = contacts.find(c => c.email === incoming.recipientEmail!.toLowerCase());
    if (!target) {
      toast.error(`${incoming.recipientName || "This person"} doesn't have a Student Diwan account yet — no message can be delivered.`);
      navigate(location.pathname, { replace: true });
      return;
    }
    startDirectChat(target);
    navigate(location.pathname, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, contacts]);

  const myState = useCallback((threadId: string) => threadStates.find(s => s.threadId === threadId && s.uid === myUid), [threadStates]);

  const otherParticipant = useCallback((t: ThreadRow) => t.participants.find(p => p.uid !== myUid), [myUid]);

  // A direct thread's stored `name` is fixed to whatever the creator typed
  // (the OTHER party's name, from the creator's side) — so the recipient
  // must never render it verbatim, or they'd see their own name instead of
  // the sender's. Always resolve direct-thread display names per viewer.
  const displayName = useCallback((t: ThreadRow) =>
    t.type === "group" ? t.name : (otherParticipant(t)?.name || t.name),
  [otherParticipant]);

  const upsertThreadState = async (threadId: string, patch: Partial<ThreadStateRow>) => {
    const id = `${threadId}__${myUid}`;
    const existing = threadStates.find(s => s.id === id);
    if (existing) {
      await smartDb.update("ChatThreadState", id, patch);
      setThreadStates(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    } else {
      const row: ThreadStateRow = { id, threadId, uid: myUid, archived: false, lastReadAt: new Date(0).toISOString(), ...patch };
      await smartDb.create("ChatThreadState", row as unknown as Record<string, unknown>, id);
      setThreadStates(prev => [...prev, row]);
    }
  };

  const threadMessages = useCallback((threadId: string) =>
    messages.filter(m => m.threadId === threadId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  [messages]);

  const isUnread = useCallback((t: ThreadRow) => {
    const st = myState(t.id);
    const lastRead = st?.lastReadAt || new Date(0).toISOString();
    return threadMessages(t.id).some(m => m.senderUid !== myUid && m.createdAt > lastRead);
  }, [myState, threadMessages, myUid]);

  const threadTier = useCallback((t: ThreadRow): "parent" | "teacher" | "student" | "other" => {
    if (t.type === "group") return "other";
    const other = otherParticipant(t);
    if (!other) return "other";
    const tier = messagingTier(other.role);
    if (tier === "parent") return "parent";
    if (tier === "teacher") return "teacher";
    if (tier === "student") return "student";
    return "other";
  }, [otherParticipant]);

  const enrichedThreads = useMemo(() => threads.map(t => ({
    thread: t,
    archived: !!myState(t.id)?.archived,
    unread: isUnread(t),
    tier: threadTier(t),
  })).sort((a, b) => (b.thread.lastMessageAt || b.thread.createdAt).localeCompare(a.thread.lastMessageAt || a.thread.createdAt)),
  [threads, myState, isUnread, threadTier]);

  const starredMessages = useMemo(() =>
    messages.filter(m => (m.starredBy || []).includes(myUid)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  [messages, myUid]);

  const visibleThreads = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return enrichedThreads.filter(({ thread, archived, unread, tier }) => {
      if (filter === "archived") { if (!archived) return false; }
      else if (archived) return false;
      if (filter === "unread" && !unread) return false;
      if (filter === "groups" && thread.type !== "group") return false;
      if (filter === "parents" && tier !== "parent") return false;
      if (filter === "teachers" && tier !== "teacher") return false;
      if (filter === "students" && tier !== "student") return false;
      if (q && !displayName(thread).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [enrichedThreads, filter, searchQuery, displayName]);

  const selectedThread = threads.find(t => t.id === selectedThreadId) || null;
  const selectedMessages = selectedThreadId ? threadMessages(selectedThreadId) : [];
  const selectedOther = selectedThread ? otherParticipant(selectedThread) : undefined;

  const selectThread = (t: ThreadRow) => {
    setSelectedThreadId(t.id);
    setShowInfo(false);
    upsertThreadState(t.id, { lastReadAt: new Date().toISOString() });
    // Clear this thread's unread bell/sidebar badge count too — otherwise
    // reading a chat here would never bring the WhatsApp-style number down.
    liveNotifications
      .filter(n => n.type === "chat_message" && n.threadId === t.id && !n.read)
      .forEach(n => markNotificationRead(n.id));
  };

  // ── Thread creation ────────────────────────────────────────────────────────
  const findDirectThread = (otherUid: string) =>
    threads.find(t => t.type === "direct" && t.participants.some(p => p.uid === otherUid));

  const startDirectChat = async (contact: ContactRow) => {
    const existing = findDirectThread(contact.uid);
    if (existing) { selectThread(existing); setNewChatOpen(false); return; }
    const id = `dm_${[myUid, contact.uid].sort().join("_")}`;
    const row: ThreadRow = {
      id, type: "direct", name: contact.name,
      participants: [
        { uid: myUid, name: myName, role: role || "", email: myEmail },
        { uid: contact.uid, name: contact.name, role: contact.role, email: contact.email },
      ],
      createdBy: myUid, createdAt: new Date().toISOString(),
    };
    await smartDb.create("ChatThread", row as unknown as Record<string, unknown>, id);
    setThreads(prev => [...prev, row]);
    selectThread(row);
    setNewChatOpen(false);
    setNewChatSearch("");
  };

  const createGroup = async () => {
    if (!groupName.trim()) { toast.error("Group name is required"); return; }
    if (groupMembers.length === 0) { toast.error("Add at least one member"); return; }
    if (!canMessageAny(role, groupMembers.map(m => m.role))) {
      toast.error("You don't have permission to message one or more selected members.");
      return;
    }
    const id = `grp_${Date.now()}`;
    const row: ThreadRow = {
      id, type: "group", name: groupName.trim(),
      participants: [
        { uid: myUid, name: myName, role: role || "", email: myEmail },
        ...groupMembers.map(m => ({ uid: m.uid, name: m.name, role: m.role, email: m.email })),
      ],
      createdBy: myUid, createdAt: new Date().toISOString(),
    };
    await smartDb.create("ChatThread", row as unknown as Record<string, unknown>, id);
    setThreads(prev => [...prev, row]);
    selectThread(row);
    setNewGroupOpen(false);
    setGroupName(""); setGroupMembers([]); setGroupSearch("");
    toast.success(`"${row.name}" group created`);
  };

  // ── Sending ────────────────────────────────────────────────────────────────
  const sendMessage = async (attachments?: Attachment[], voiceNote?: VoiceNote) => {
    if (!selectedThreadId) return;
    const text = messageInput.trim();
    if (!text && (!attachments || attachments.length === 0) && !voiceNote) return;

    setMessageInput("");
    const now = new Date().toISOString();
    const created = await smartDb.create("ChatMessage", {
      threadId: selectedThreadId, senderUid: myUid, senderName: myName,
      text, attachments: attachments || [], voiceNote: voiceNote || null, createdAt: now, starredBy: [],
    });
    const row: MessageRow = {
      id: String(created.id), threadId: selectedThreadId, senderUid: myUid, senderName: myName,
      text, attachments: attachments || [], voiceNote, createdAt: now, starredBy: [],
    };
    setMessages(prev => [...prev, row]);

    const preview = text || (voiceNote ? `🎤 Voice message (${voiceNote.durationSec}s)` : attachments?.length ? `📎 ${attachments[0].name}${attachments.length > 1 ? ` +${attachments.length - 1}` : ""}` : "");
    await smartDb.update("ChatThread", selectedThreadId, { lastMessage: preview, lastMessageAt: now, lastSenderUid: myUid });
    setThreads(prev => prev.map(t => t.id === selectedThreadId ? { ...t, lastMessage: preview, lastMessageAt: now, lastSenderUid: myUid } : t));
    await upsertThreadState(selectedThreadId, { lastReadAt: now });

    // Real, instant (see useNotifications.ts) notification to every other
    // participant — this is what drives the unread badge and the
    // WhatsApp-style desktop popup, not just an in-app-only update.
    const thread = threads.find(t => t.id === selectedThreadId);
    const recipients = (thread?.participants || []).filter(p => p.uid !== myUid);
    await Promise.all(recipients.map(p => smartDb.create("Notification", {
      type: "chat_message",
      category: "general",
      title: thread?.type === "group" ? `${myName} in ${thread.name}` : `New message from ${myName}`,
      message: preview,
      recipientUid: p.uid,
      threadId: selectedThreadId,
      time: now,
    })));
  };

  const handleAttachClick = () => fileInputRef.current?.click();
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const attachments: Attachment[] = files.map(f => ({ name: f.name, size: f.size, type: f.type || "application/octet-stream" }));
    await sendMessage(attachments);
    e.target.value = "";
  };

  const toggleStar = async (m: MessageRow) => {
    const starred = (m.starredBy || []).includes(myUid);
    const next = starred ? (m.starredBy || []).filter(u => u !== myUid) : [...(m.starredBy || []), myUid];
    await smartDb.update("ChatMessage", m.id, { starredBy: next });
    setMessages(prev => prev.map(x => x.id === m.id ? { ...x, starredBy: next } : x));
  };

  const toggleArchive = async (t: ThreadRow) => {
    const archived = !myState(t.id)?.archived;
    await upsertThreadState(t.id, { archived });
    toast.success(archived ? "Conversation archived" : "Conversation restored");
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [selectedMessages.length]);

  // ── Right info panel data (real, from existing entities) ────────────────────
  const linkedStudent = useMemo(() => {
    if (!selectedOther) return null;
    const email = selectedOther.email.toLowerCase();
    if (messagingTier(selectedOther.role) !== "parent") return null;
    return students.find((s: any) =>
      (s.fatherEmail || "").toLowerCase() === email ||
      (s.motherEmail || "").toLowerCase() === email ||
      (s.guardianEmail || "").toLowerCase() === email
    ) || null;
  }, [selectedOther, students]);

  const linkedAlerts = useMemo(() => {
    if (!linkedStudent) return [];
    return notifications
      .filter((n: any) => n.studentId === linkedStudent.id)
      .sort((a: any, b: any) => (b.time || "").localeCompare(a.time || ""))
      .slice(0, 6);
  }, [linkedStudent, notifications]);

  const sharedFiles = useMemo(() => {
    if (!selectedThreadId) return [];
    return threadMessages(selectedThreadId).flatMap(m => (m.attachments || []).map(a => ({ ...a, senderName: m.senderName, createdAt: m.createdAt })));
  }, [selectedThreadId, threadMessages]);

  // ── New Chat / New Group contact pools ───────────────────────────────────────
  const newChatContacts = contacts.filter(c => c.name.toLowerCase().includes(newChatSearch.toLowerCase()) || c.email.includes(newChatSearch.toLowerCase()));
  const groupPickContacts = contacts.filter(c =>
    !groupMembers.some(m => m.uid === c.uid) &&
    (c.name.toLowerCase().includes(groupSearch.toLowerCase()) || c.email.includes(groupSearch.toLowerCase()))
  );

  const FILTERS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" }, { key: "unread", label: "Unread" }, { key: "groups", label: "Groups" },
    { key: "parents", label: "Parents" }, { key: "teachers", label: "Teachers" }, { key: "students", label: "Students" },
    { key: "starred", label: "Starred" }, { key: "archived", label: "Archived" },
  ];

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-112px)] gap-4 overflow-hidden">
        {/* Sidebar / Chat List */}
        <Card className="w-full md:w-80 flex flex-col premium-card overflow-hidden">
          <CardHeader className="p-4 border-b border-border shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold tracking-tight">Messages</h2>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" title="New group" onClick={() => setNewGroupOpen(true)}>
                  <Users className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" title="New chat" onClick={() => setNewChatOpen(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search conversations..." className="pl-9 h-9 text-sm" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {FILTERS.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={cn("px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors",
                    filter === f.key ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted/50")}>
                  {f.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-y-auto">
            {loading && <div className="p-6 text-center text-sm text-muted-foreground">Loading conversations…</div>}
            {!loading && visibleThreads.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground space-y-2">
                <MessageSquare className="h-8 w-8 mx-auto opacity-30" />
                <p>{filter === "all" ? "No conversations yet." : "Nothing here."}</p>
                {filter === "all" && <Button size="sm" variant="outline" className="rounded-full" onClick={() => setNewChatOpen(true)}>Start a conversation</Button>}
              </div>
            )}
            <div className="divide-y divide-border">
              {visibleThreads.map(({ thread, unread, archived }) => (
                <button key={thread.id} onClick={() => selectThread(thread)}
                  className={cn("w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50",
                    selectedThreadId === thread.id && "bg-primary/5 border-r-2 border-primary")}>
                  <div className="relative">
                    <Avatar className="h-11 w-11 border border-border">
                      <AvatarFallback className={cn("font-bold text-xs", thread.type === "group" ? "bg-violet-100 text-violet-700" : "bg-primary/10 text-primary")}>
                        {thread.type === "group" ? <Users className="h-4 w-4" /> : initials(displayName(thread))}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className={cn("text-sm font-bold truncate", unread ? "text-foreground" : "text-foreground/80")}>{displayName(thread)}</p>
                      <span className="text-[10px] text-muted-foreground font-medium shrink-0">{fmtListTime(thread.lastMessageAt || thread.createdAt)}</span>
                    </div>
                    <p className={cn("text-xs truncate", unread ? "text-foreground font-semibold" : "text-muted-foreground")}>
                      {thread.lastMessage || "No messages yet"}
                    </p>
                  </div>
                  {archived && <Archive className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  {unread && !archived && <div className="h-2.5 w-2.5 rounded-full bg-primary shrink-0" />}
                </button>
              ))}
              {filter === "starred" && starredMessages.map(m => {
                const t = threads.find(th => th.id === m.threadId);
                if (!t) return null;
                return (
                  <button key={m.id} onClick={() => selectThread(t)} className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/50 transition-colors">
                    <Star className="h-4 w-4 text-amber-500 fill-amber-500 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{displayName(t)}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.text || `📎 ${m.attachments?.[0]?.name}`}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Chat Area */}
        <Card className="flex-1 flex flex-col premium-card overflow-hidden">
          {selectedThread ? (
            <>
              <div className="p-4 border-b border-border flex items-center justify-between bg-card/50 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-10 w-10 border border-border shrink-0">
                    <AvatarFallback className={cn("font-bold text-xs", selectedThread.type === "group" ? "bg-violet-100 text-violet-700" : "bg-primary/10 text-primary")}>
                      {selectedThread.type === "group" ? <Users className="h-4 w-4" /> : initials(displayName(selectedThread))}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold leading-none mb-1 truncate">{displayName(selectedThread)}</h3>
                    <p className="text-[10px] text-muted-foreground font-medium truncate">
                      {selectedThread.type === "group"
                        ? `${selectedThread.participants.length} members`
                        : getRole(selectedOther?.role).label}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" title={myState(selectedThread.id)?.archived ? "Unarchive" : "Archive"} onClick={() => toggleArchive(selectedThread)}>
                    {myState(selectedThread.id)?.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                  </Button>
                  <Button variant={showInfo ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-full" onClick={() => setShowInfo(v => !v)}>
                    <Info className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-muted/5">
                    {selectedMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-50">
                        <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center">
                          <User className="h-8 w-8" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">No messages yet</p>
                          <p className="text-xs">Start the conversation with {displayName(selectedThread)}</p>
                        </div>
                      </div>
                    ) : (
                      <AnimatePresence initial={false}>
                        {selectedMessages.map((msg, idx) => {
                          const mine = msg.senderUid === myUid;
                          const prev = selectedMessages[idx - 1];
                          const showDate = !prev || dateLabel(prev.createdAt) !== dateLabel(msg.createdAt);
                          const starred = (msg.starredBy || []).includes(myUid);
                          // Read receipt: for direct threads, "read" once the other
                          // participant's own last-read timestamp covers this message.
                          let readState: "sent" | "read" = "sent";
                          if (mine && selectedThread.type === "direct" && selectedOther) {
                            const otherState = threadStates.find(s => s.threadId === selectedThread.id && s.uid === selectedOther.uid);
                            if (otherState?.lastReadAt && otherState.lastReadAt >= msg.createdAt) readState = "read";
                          }
                          return (
                            <div key={msg.id}>
                              {showDate && (
                                <div className="flex items-center justify-center my-3">
                                  <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">{dateLabel(msg.createdAt)}</span>
                                </div>
                              )}
                              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                                className={cn("flex w-full group", mine ? "justify-end" : "justify-start")}>
                                <div className={cn("max-w-[70%] rounded-2xl p-3 text-sm shadow-sm relative",
                                  mine ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-card border border-border rounded-tl-none")}>
                                  {!mine && selectedThread.type === "group" && (
                                    <p className="text-[10px] font-bold mb-0.5 opacity-70">{msg.senderName}</p>
                                  )}
                                  {msg.text && <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>}
                                  {msg.voiceNote && (
                                    <div className="flex items-center gap-2 mt-1.5 min-w-[200px]">
                                      <Mic className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                      <audio controls src={msg.voiceNote.dataUrl} className="h-8 flex-1" />
                                      <span className="text-[10px] opacity-70 shrink-0 tabular-nums">
                                        {Math.floor(msg.voiceNote.durationSec / 60)}:{String(msg.voiceNote.durationSec % 60).padStart(2, "0")}
                                      </span>
                                    </div>
                                  )}
                                  {(msg.attachments || []).map((a, i) => (
                                    <div key={i} className={cn("flex items-center gap-2 rounded-lg px-2.5 py-2 mt-1.5 text-xs",
                                      mine ? "bg-white/15" : "bg-muted")}>
                                      <FileText className="h-3.5 w-3.5 shrink-0" />
                                      <span className="truncate flex-1">{a.name}</span>
                                      <span className="opacity-70 shrink-0">{fmtBytes(a.size)}</span>
                                    </div>
                                  ))}
                                  <div className={cn("flex items-center justify-end gap-1 mt-1 text-[9px] font-medium opacity-70")}>
                                    {fmtTime(msg.createdAt)}
                                    {mine && (readState === "read" ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                                  </div>
                                  <button onClick={() => toggleStar(msg)}
                                    className={cn("absolute -top-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-1 bg-card border border-border shadow-sm",
                                      mine ? "-left-2" : "-right-2")}>
                                    <Star className={cn("h-3 w-3", starred ? "fill-amber-500 text-amber-500" : "text-muted-foreground")} />
                                  </button>
                                </div>
                              </motion.div>
                            </div>
                          );
                        })}
                      </AnimatePresence>
                    )}
                    <div ref={bottomRef} />
                  </div>

                  <div className="p-4 border-t border-border bg-card/50 shrink-0">
                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFilesSelected} />
                    {voicePreview ? (
                      <div className="flex items-center gap-2 bg-muted/50 rounded-full pl-2 pr-1.5 py-1.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full shrink-0 text-rose-500 hover:text-rose-600" title="Discard" onClick={discardVoicePreview}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <audio controls src={voicePreview.dataUrl} className="h-8 flex-1 min-w-0" />
                        <span className="text-[10px] font-semibold text-muted-foreground shrink-0 tabular-nums">{Math.floor(voicePreview.durationSec / 60)}:{String(voicePreview.durationSec % 60).padStart(2, "0")}</span>
                        <Button className="h-9 w-9 rounded-full gradient-primary shadow-lg shadow-primary/20 shrink-0 p-0" onClick={sendVoiceNote}>
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : isRecording ? (
                      <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-full pl-4 pr-1.5 py-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
                        <span className="text-sm font-semibold text-rose-700 tabular-nums flex-1">
                          Recording… {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, "0")}
                        </span>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full shrink-0 text-rose-500 hover:text-rose-600" title="Cancel" onClick={cancelVoiceRecording}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button className="h-9 w-9 rounded-full bg-rose-500 hover:bg-rose-600 text-white shrink-0 p-0" title="Stop and preview" onClick={stopVoiceRecording}>
                          <Square className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full shrink-0" title="Attach file" onClick={handleAttachClick}>
                          <Paperclip className="h-4 w-4" />
                        </Button>
                        <Input placeholder="Type a message..." className="h-10 flex-1 rounded-full bg-muted/50 border-none focus-visible:ring-1 focus-visible:ring-primary/30"
                          value={messageInput} onChange={e => setMessageInput(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && sendMessage()} />
                        {messageInput.trim() ? (
                          <Button className="h-10 w-10 rounded-full gradient-primary shadow-lg shadow-primary/20 shrink-0 p-0"
                            onClick={() => sendMessage()}>
                            <Send className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button className="h-10 w-10 rounded-full gradient-primary shadow-lg shadow-primary/20 shrink-0 p-0" title="Record voice message" onClick={startVoiceRecording}>
                            <Mic className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right info panel */}
                {showInfo && (
                  <div className="w-72 border-l border-border overflow-y-auto shrink-0 bg-card/30">
                    <div className="p-4 border-b border-border flex items-center justify-between">
                      <h4 className="text-sm font-bold">Details</h4>
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => setShowInfo(false)}><X className="h-3.5 w-3.5" /></Button>
                    </div>

                    <div className="p-4 flex flex-col items-center text-center border-b border-border">
                      <Avatar className="h-16 w-16 mb-2">
                        <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">
                          {selectedThread.type === "group" ? <Users className="h-6 w-6" /> : initials(displayName(selectedThread))}
                        </AvatarFallback>
                      </Avatar>
                      <p className="text-sm font-bold">{displayName(selectedThread)}</p>
                      {selectedThread.type === "direct" && selectedOther && (
                        <>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground mt-1">{getRole(selectedOther.role).label}</span>
                          <div className="mt-3 w-full space-y-1.5 text-left">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{selectedOther.email || "Not on file"}</span></div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Phone className="h-3.5 w-3.5 shrink-0" /><span>{linkedStudent?.guardianPhone || linkedStudent?.fatherPhone || linkedStudent?.motherPhone || "Not on file"}</span></div>
                          </div>
                        </>
                      )}
                    </div>

                    {selectedThread.type === "group" && (
                      <div className="p-4 border-b border-border">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Members ({selectedThread.participants.length})</p>
                        <div className="space-y-2">
                          {selectedThread.participants.map(p => (
                            <div key={p.uid} className="flex items-center gap-2">
                              <Avatar className="h-7 w-7"><AvatarFallback className="text-[10px] bg-muted">{initials(p.name)}</AvatarFallback></Avatar>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold truncate">{p.name}{p.uid === myUid ? " (you)" : ""}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{getRole(p.role).label}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {linkedStudent && (
                      <div className="p-4 border-b border-border">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Bell className="h-3.5 w-3.5" /> Communication History — {linkedStudent.name}
                        </p>
                        {linkedAlerts.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No recent alerts on file.</p>
                        ) : (
                          <div className="space-y-2">
                            {linkedAlerts.map((n: any) => (
                              <div key={n.id} className="text-xs p-2 rounded-lg bg-muted/50">
                                <p className="font-semibold truncate">{n.title || n.type}</p>
                                <p className="text-muted-foreground text-[10px]">{n.category || "general"} · {fmtListTime(n.time)}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Shared Files ({sharedFiles.length})</p>
                      {sharedFiles.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No files shared yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {sharedFiles.map((f, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-muted/50">
                              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate flex-1">{f.name}</span>
                              <span className="text-muted-foreground shrink-0">{fmtBytes(f.size)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <div className="h-20 w-20 rounded-3xl bg-primary/5 flex items-center justify-center text-primary/20">
                <MessageSquare className="h-10 w-10" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Select a conversation</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Choose a chat from the sidebar to start messaging with staff, parents, or students.
                </p>
              </div>
              <Button variant="outline" className="rounded-full" onClick={() => setNewChatOpen(true)}>Start New Chat</Button>
            </div>
          )}
        </Card>
      </div>

      {/* New Direct Chat */}
      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Conversation</DialogTitle></DialogHeader>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search people..." className="pl-9 h-9" value={newChatSearch} onChange={e => setNewChatSearch(e.target.value)} autoFocus />
          </div>
          <div className="max-h-72 overflow-y-auto -mx-2 px-2">
            {newChatContacts.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No matching contacts you're able to message.</p>}
            {newChatContacts.map(c => (
              <button key={c.uid} onClick={() => startDirectChat(c)} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/60 transition-colors text-left">
                <Avatar className="h-9 w-9"><AvatarFallback className="text-xs bg-primary/10 text-primary">{initials(c.name)}</AvatarFallback></Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{getRole(c.role).label}</p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* New Group */}
      <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Group</DialogTitle></DialogHeader>
          <Input placeholder="Group name (e.g. Grade 10 Teachers)" value={groupName} onChange={e => setGroupName(e.target.value)} className="mb-2" />
          {groupMembers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {groupMembers.map(m => (
                <span key={m.uid} className="flex items-center gap-1 text-[11px] font-semibold bg-primary/10 text-primary px-2 py-1 rounded-full">
                  {m.name}
                  <button onClick={() => setGroupMembers(prev => prev.filter(x => x.uid !== m.uid))}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Add members..." className="pl-9 h-9" value={groupSearch} onChange={e => setGroupSearch(e.target.value)} />
          </div>
          <div className="max-h-52 overflow-y-auto -mx-2 px-2">
            {groupPickContacts.map(c => (
              <button key={c.uid} onClick={() => { setGroupMembers(prev => [...prev, c]); setGroupSearch(""); }} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/60 transition-colors text-left">
                <Avatar className="h-8 w-8"><AvatarFallback className="text-xs bg-muted">{initials(c.name)}</AvatarFallback></Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{getRole(c.role).label}</p>
                </div>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewGroupOpen(false)}>Cancel</Button>
            <Button onClick={createGroup}>Create Group</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Messages;
