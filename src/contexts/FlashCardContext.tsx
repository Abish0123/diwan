/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { FlashCardSet, FlashCardAnalytics } from '@/types/flashcard';
import { FlashCardContext } from './FlashCardContextDefinition';
import { useAuth } from '@/hooks/useAuth';
import { smartDb } from '@/lib/localDb';
import { isFirestoreWorking, handleFirestoreError, OperationType, db } from '@/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

export const useFlashCards = () => {
  const context = useContext(FlashCardContext);
  if (context === undefined) {
    throw new Error("useFlashCards must be used within a FlashCardProvider");
  }
  return context;
};

// The persisted/seeded FlashCardSet rows come from more than one shape:
//  - the "type-correct" shape: { name, createdBy, classId, cards:[{question,answer,type}] }
//  - a legacy/seed shape:      { title, author, grade,   cards:[{front,back}] }
// Consumers disagree on which they read (the admin page, practice screen and the
// FlashCardSet type expect the first; the student page reads the second). This
// normalizer coerces every row to the declared FlashCardSet type while ALSO
// keeping the legacy aliases (title/author/front/back) so no consumer breaks.
function normalizeSet(raw: Record<string, unknown>): FlashCardSet {
  const r = raw as Record<string, any>;
  const name = r.name ?? r.title ?? "Untitled Set";
  const createdBy = r.createdBy ?? r.author ?? "You";
  const classId = r.classId
    ?? (r.grade ? (String(r.grade).toLowerCase().startsWith("grade") ? String(r.grade) : `Grade ${r.grade}`) : (r.chapter ?? ""));
  const cards = Array.isArray(r.cards) ? r.cards.map((c: Record<string, any>, i: number) => {
    const question = c.question ?? c.front ?? "";
    const answer = c.answer ?? c.back ?? "";
    return {
      ...c,
      id: c.id ?? `${r.id}-card-${i}`,
      type: c.type ?? "standard",
      question, answer,
      front: question, back: answer, // legacy aliases for the student page
    };
  }) : [];
  return {
    ...r,
    id: r.id,
    name, title: name,
    subject: r.subject ?? "",
    classId,
    tags: Array.isArray(r.tags) ? r.tags : [],
    cards,
    createdBy, author: createdBy,
    createdAt: r.createdAt ?? "",
    lastModified: r.lastModified ?? r.updatedAt ?? r.createdAt ?? "",
    studyOptions: {
      shuffle: r.studyOptions?.shuffle ?? true,
      spacedRepetition: r.studyOptions?.spacedRepetition ?? true,
      showHints: r.studyOptions?.showHints ?? true,
      typeAnswer: r.studyOptions?.typeAnswer ?? false,
      gamified: r.studyOptions?.gamified ?? true,
    },
  } as unknown as FlashCardSet;
}

export const FlashCardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isMockSession } = useAuth();
  const [sets, setSets] = useState<FlashCardSet[]>([]);
  const [analytics, setAnalytics] = useState<FlashCardAnalytics[]>([]);
  const [loading, setLoading] = useState(true);

  // FlashCardSet.uid is whichever teacher/admin authored the set — sets are
  // shared teaching material, distributed to students via the separate
  // `assignedTo` list below, not by who created them. Scoping this fetch to
  // the viewer's own uid hid every set authored by a different teacher.
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [setsData, analyticsData] = await Promise.all([
        smartDb.getAll("FlashCardSet", undefined),
        smartDb.getAll("FlashCardAnalytics", undefined)
      ]);
      setSets((setsData || []).map(normalizeSet));
      setAnalytics(analyticsData);
    } catch (error) {
      console.error("Error fetching flashcards:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setSets([]);
      setAnalytics([]);
      setLoading(false);
      return;
    }

    if (!isFirestoreWorking || isMockSession || user.uid.startsWith('demo-')) {
      fetchData();
      return;
    }

    setLoading(true);
    const unsubscribeSets = onSnapshot(collection(db, "FlashCardSet"), (snapshot) => {
      const data = snapshot.docs.map(doc => normalizeSet({ id: doc.id, ...doc.data() }));
      setSets(data);
      setLoading(false);
    }, (error) => {
      console.warn("Firestore snapshot failed for flashcard sets, falling back to local fetch.");
      fetchData();
    });

    const unsubscribeAnalytics = onSnapshot(collection(db, "FlashCardAnalytics"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as FlashCardAnalytics[];
      setAnalytics(data);
    }, (error) => console.warn("Firestore snapshot failed for flashcard analytics"));

    return () => {
      unsubscribeSets();
      unsubscribeAnalytics();
    };
  }, [user, isMockSession, fetchData]);

  const addSet = useCallback(async (newSet: Omit<FlashCardSet, 'id' | 'createdAt' | 'lastModified'>) => {
    if (!user) return;
    try {
      await smartDb.create("FlashCardSet", {
        ...newSet,
        uid: user.uid,
        createdAt: new Date().toISOString().split('T')[0],
        lastModified: new Date().toISOString().split('T')[0]
      });
      if (!isFirestoreWorking || isMockSession) fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "FlashCardSet");
    }
  }, [user, isMockSession, fetchData]);

  const updateSet = useCallback(async (id: string, updatedFields: Partial<FlashCardSet>) => {
    try {
      await smartDb.update("FlashCardSet", id, {
        ...updatedFields,
        lastModified: new Date().toISOString().split('T')[0]
      });
      if (!isFirestoreWorking || isMockSession) fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "FlashCardSet");
    }
  }, [isMockSession, fetchData]);

  const deleteSet = useCallback(async (id: string) => {
    try {
      await smartDb.delete("FlashCardSet", id);
      if (!isFirestoreWorking || isMockSession) fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "FlashCardSet");
    }
  }, [isMockSession, fetchData]);

  const assignSet = useCallback((setId: string, targetIds: string[]) => {
    updateSet(setId, { assignedTo: targetIds });
  }, [updateSet]);

  const assignedSets = useMemo(() => sets.filter(s => s.assignedTo && s.assignedTo.length > 0), [sets]);
  const aiGeneratedSets = useMemo(() => sets.filter(s => s.isAiGenerated), [sets]);

  const value = useMemo(() => ({
    sets,
    assignedSets,
    aiGeneratedSets,
    analytics,
    addSet,
    updateSet,
    deleteSet,
    assignSet
  }), [sets, assignedSets, aiGeneratedSets, analytics, addSet, updateSet, deleteSet, assignSet]);

  return (
    <FlashCardContext.Provider value={value}>
      {children}
    </FlashCardContext.Provider>
  );
};
