import { useState, useEffect } from "react";
import { db, handleFirestoreError, OperationType, auth, isFirestoreWorking } from "@/firebase";
import { collection, onSnapshot, query, addDoc, setDoc, doc, serverTimestamp, where, deleteDoc } from "firebase/firestore";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { Achievement } from "@/types/classes";

export const useAchievements = () => {
  const { user } = useAuth();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setAchievements([]);
      setLoading(false);
      return;
    }

    const isMock = !auth.currentUser || (user && user.uid.startsWith('demo-')) || (auth.currentUser?.uid && auth.currentUser.uid.startsWith('demo-'));
    
    if (!isFirestoreWorking || isMock) {
      smartDb.getAll("Achievement", user.uid).then(data => {
        setAchievements(data as Achievement[]);
        setLoading(false);
      });
      return;
    }

    setLoading(true);
    const q = query(collection(db, "achievements"), where("uid", "==", user.uid));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const achievementData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Achievement[];
      setAchievements(achievementData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "achievements");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const addAchievement = async (data: Omit<Achievement, "id" | "uid" | "createdAt">) => {
    if (!user) return;
    try {
      await addDoc(collection(db, "achievements"), {
        ...data,
        uid: user.uid,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "achievements");
    }
  };

  const updateAchievement = async (id: string, data: Partial<Achievement>) => {
    if (!user) return;
    try {
      await setDoc(doc(db, "achievements", id), data, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "achievements");
    }
  };

  const deleteAchievement = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "achievements", id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "achievements");
    }
  };

  return { achievements, addAchievement, updateAchievement, deleteAchievement, loading };
};
