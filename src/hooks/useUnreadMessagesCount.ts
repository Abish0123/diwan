import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";

interface ThreadRow { id: string; participants?: { uid: string }[] }
interface MessageRow { id: string; threadId: string; senderUid: string; createdAt: string }
interface ThreadStateRow { id: string; threadId: string; uid: string; lastReadAt?: string }

// Same real ChatThread/ChatMessage/ChatThreadState entities and unread
// derivation Messages.tsx already uses (a thread is unread when it has a
// message from someone else newer than this user's own lastReadAt) —
// extracted so dashboard widgets can show a real unread count without
// duplicating Messages.tsx's full page logic.
export function useUnreadMessagesCount(): { count: number; loading: boolean } {
  const { user } = useAuth();
  const myUid = user?.uid || "";
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!myUid) { setLoading(false); return; }
    let active = true;
    (async () => {
      try {
        const [threads, messages, states] = await Promise.all([
          smartDb.getAll("ChatThread") as Promise<ThreadRow[]>,
          smartDb.getAll("ChatMessage") as Promise<MessageRow[]>,
          smartDb.getAll("ChatThreadState") as Promise<ThreadStateRow[]>,
        ]);
        if (!active) return;
        const mine = (threads || []).filter(t => (t.participants || []).some(p => p.uid === myUid));
        const myThreadIds = new Set(mine.map(t => t.id));
        const myMessages = (messages || []).filter(m => myThreadIds.has(m.threadId));
        const myStates = (states || []).filter(s => s.uid === myUid);
        const unread = mine.filter(t => {
          const lastRead = myStates.find(s => s.threadId === t.id)?.lastReadAt || new Date(0).toISOString();
          return myMessages.some(m => m.threadId === t.id && m.senderUid !== myUid && m.createdAt > lastRead);
        }).length;
        setCount(unread);
      } catch {
        if (active) setCount(0);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [myUid]);

  return { count, loading };
}
