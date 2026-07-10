import { createContext } from "react";
import { FlashCardSet, FlashCardAnalytics } from '@/types/flashcard';

export interface FlashCardContextType {
  sets: FlashCardSet[];
  assignedSets: FlashCardSet[];
  aiGeneratedSets: FlashCardSet[];
  analytics: FlashCardAnalytics[];
  addSet: (set: Omit<FlashCardSet, 'id' | 'createdAt' | 'lastModified'>) => void;
  updateSet: (id: string, set: Partial<FlashCardSet>) => void;
  deleteSet: (id: string) => void;
  assignSet: (setId: string, targetIds: string[]) => void;
}

export const FlashCardContext = createContext<FlashCardContextType | undefined>(undefined);
