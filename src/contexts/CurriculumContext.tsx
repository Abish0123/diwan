// Provides the active curriculum to the entire app.
// Loaded once at startup so every component gets grades/terms from a single source.
import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  type CurriculumConfig, type CurriculumId,
  getCurriculum, getPeriodLabels, DEFAULT_CURRICULUM_ID,
} from '@/lib/curriculumConfig';
import { loadCurriculumId, _curriculumListeners } from '@/hooks/useCurriculum';

interface CurriculumContextType {
  curriculum:   CurriculumConfig;
  curriculumId: CurriculumId;
  /** Ordered grade list for the active curriculum */
  grades:       string[];
  /** Period labels e.g. ["Term 1","Term 2","Term 3"] */
  terms:        string[];
  loading:      boolean;
}

const defaultCurriculum = getCurriculum(DEFAULT_CURRICULUM_ID);
const CurriculumContext = createContext<CurriculumContextType>({
  curriculum:   defaultCurriculum,
  curriculumId: DEFAULT_CURRICULUM_ID,
  grades:       defaultCurriculum.grades,
  terms:        getPeriodLabels(defaultCurriculum),
  loading:      true,
});

export function CurriculumProvider({ children }: { children: React.ReactNode }) {
  const [curriculumId, setCurriculumId] = useState<CurriculumId>(DEFAULT_CURRICULUM_ID);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    loadCurriculumId().then(id => {
      if (alive) { setCurriculumId(id); setLoading(false); }
    });

    const refresh = () => {
      loadCurriculumId().then(id => { if (alive) setCurriculumId(id); });
    };
    _curriculumListeners.add(refresh);
    return () => { alive = false; _curriculumListeners.delete(refresh); };
  }, []);

  const curriculum = getCurriculum(curriculumId);

  const value = useMemo(() => ({
    curriculum, curriculumId,
    grades:  curriculum.grades,
    terms:   getPeriodLabels(curriculum),
    loading,
  }), [curriculum, curriculumId, loading]);

  return (
    <CurriculumContext.Provider value={value}>
      {children}
    </CurriculumContext.Provider>
  );
}

export function useCurriculumContext(): CurriculumContextType {
  return useContext(CurriculumContext);
}

/** Returns just the grade list for the active curriculum. */
export function useGrades(): string[] {
  return useContext(CurriculumContext).grades;
}

/** Returns just the term/semester labels e.g. ["Term 1","Term 2","Term 3"]. */
export function useTerms(): string[] {
  return useContext(CurriculumContext).terms;
}
