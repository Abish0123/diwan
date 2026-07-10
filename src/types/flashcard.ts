export type FlashCardType = 
  | 'standard' 
  | 'mcq' 
  | 'true-false' 
  | 'fill-blank' 
  | 'image' 
  | 'match' 
  | 'audio' 
  | 'voice' 
  | 'case' 
  | 'formula';

export interface FlashCard {
  id: string;
  type: FlashCardType;
  question: string;
  answer: string; // For standard, true-false, fill-blank, formula
  options?: string[]; // For mcq
  correctOptionIndex?: number; // For mcq
  imageUrl?: string; // For image
  audioUrl?: string; // For audio
  pairs?: { left: string; right: string }[]; // For match
  scenario?: string; // For case
  explanation?: string; // For mcq, case, formula
  difficulty?: 'easy' | 'medium' | 'hard';
  tags?: string[];
  lastPracticed?: string;
  masteryLevel?: number; // 0 to 100
  isAiGenerated?: boolean;
}

// Study-mode preferences the practice screen honours (also togglable live by
// the student). Defaults are filled in by the context normalizer.
export interface FlashCardStudyOptions {
  shuffle: boolean;           // randomize card order each session
  spacedRepetition: boolean;  // Leitner requeue — missed cards come back sooner
  showHints: boolean;         // progressive hint reveals before the answer
  typeAnswer: boolean;        // active-recall: type the answer, auto-checked
  gamified: boolean;          // XP, streaks & combo rewards for motivation
}

export interface FlashCardSet {
  id: string;
  name: string;
  subject: string;
  classId: string;
  tags: string[];
  cards: FlashCard[];
  createdBy: string;
  createdAt: string;
  lastModified: string;
  progress?: number; // 0 to 100
  assignedTo?: string[]; // studentIds or classIds
  isAiGenerated?: boolean;
  studyOptions?: FlashCardStudyOptions;
}

export interface FlashCardAnalytics {
  setId: string;
  studentId: string;
  accuracyRate: number;
  revisionDue: number;
  weakTopics: string[];
  timeSpent: number; // in minutes
  revisionFrequency: number; // sessions per week
  lastPracticed: string;
}
