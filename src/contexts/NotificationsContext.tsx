/**
 * NotificationsContext
 * --------------------
 * Runs the notification feed ONCE at app level so that the header bell
 * dropdown and the /communication/notifications full-page view always share
 * exactly the same list and read-state — no divergence, no duplicates.
 */
import { createContext, useContext, type ReactNode } from "react";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";

export type { AppNotification };

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => void;
  markRead: (id: string, read?: boolean) => void;
  deleteNotification: (id: string) => void;
  deleteNotifications: (ids: string[]) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const value = useNotifications();
  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

/** Consume the shared notification feed. Throws if used outside the provider. */
export function useNotificationsContext(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotificationsContext must be used within NotificationsProvider");
  return ctx;
}
