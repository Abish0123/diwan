import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { db, handleFirestoreError, OperationType, isFirestoreWorking } from "@/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";

export interface FinancialSettings {
  openingBalance: number;
  initialCapital: number;
  bankLoan: number;
  retainedEarnings: number;
  currency: string;
  targetUtilization: number;
  uid: string;
}

const DEFAULT_SETTINGS: FinancialSettings = {
  openingBalance: 0,
  initialCapital: 0,
  bankLoan: 0,
  retainedEarnings: 0,
  currency: "BHD",
  targetUtilization: 90,
  uid: "",
};

export function useFinancialSettings() {
  const { user, isMockSession } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["financial-settings", user?.uid];

  // react-query dedupes and caches by queryKey — every page that rendered
  // more than one consumer of this hook (header, sidebar, the page itself)
  // used to fire its own independent fetch on mount, and each fetch was
  // itself two requests (a by-id 404 falling back to a full-list scan).
  // With this, all consumers on a page share one in-flight request and one
  // cached result.
  const { data: settings = DEFAULT_SETTINGS, isLoading: loading } = useQuery({
    queryKey,
    queryFn: () => smartDb.getOne("FinancialSettings", user!.uid).then(d => (d as FinancialSettings) ?? DEFAULT_SETTINGS),
    enabled: !!user && (isMockSession || !isFirestoreWorking),
  });

  useEffect(() => {
    if (!user || isMockSession || !isFirestoreWorking) return;
    const unsub = onSnapshot(
      doc(db, "financial_settings", user.uid),
      (snap) => {
        if (snap.exists()) queryClient.setQueryData(queryKey, snap.data() as FinancialSettings);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "financial_settings");
        queryClient.invalidateQueries({ queryKey });
      }
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isMockSession, queryClient]);

  const updateSettings = async (newSettings: Partial<FinancialSettings>) => {
    if (!user) return;
    try {
      await smartDb.update("FinancialSettings", user.uid, {
        ...newSettings,
        uid: user.uid,
        updatedAt: new Date().toISOString()
      });
      queryClient.invalidateQueries({ queryKey });
      toast.success("Financial settings updated");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "FinancialSettings");
    }
  };

  const updateCurrency = async (newCurrency: string) => {
    await updateSettings({ currency: newCurrency });
  };

  return { settings, loading, updateSettings, updateCurrency };
}
