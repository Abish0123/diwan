import { useState, useEffect } from 'react';
import { smartDb } from '@/lib/localDb';
import {
  type CurriculumConfig, type CurriculumId,
  getCurriculum, DEFAULT_CURRICULUM_ID,
} from '@/lib/curriculumConfig';

const ENTITY = 'school_config';
const ROW_ID = 'active_curriculum';

// Module-level cache — shared across all hook instances.
let _cachedId: CurriculumId | null = null;

// All listeners (useCurriculum hooks + CurriculumContext) subscribe here.
// CurriculumContext imports this set and adds its own refresh.
export const _curriculumListeners = new Set<() => void>();
function _notify() { _curriculumListeners.forEach(fn => fn()); }

export async function saveCurriculumId(id: CurriculumId): Promise<void> {
  _cachedId = id;
  _notify();
  const payload = { id: ROW_ID, curriculumId: id };
  try {
    await smartDb.update(ENTITY, ROW_ID, payload);
  } catch {
    try {
      await smartDb.create(ENTITY, payload, ROW_ID);
    } catch { /* table auto-created on first CRUD call */ }
  }
}

export async function loadCurriculumId(): Promise<CurriculumId> {
  if (_cachedId) return _cachedId;
  try {
    const row = await smartDb.getOne(ENTITY, ROW_ID);
    _cachedId = (row?.curriculumId as CurriculumId) ?? DEFAULT_CURRICULUM_ID;
  } catch {
    _cachedId = DEFAULT_CURRICULUM_ID;
  }
  return _cachedId!;
}

export interface UseCurriculumResult {
  curriculum:   CurriculumConfig;
  curriculumId: CurriculumId;
  loading:      boolean;
}

export function useCurriculum(): UseCurriculumResult {
  const [curriculumId, setCurriculumId] = useState<CurriculumId>(
    _cachedId ?? DEFAULT_CURRICULUM_ID
  );
  const [loading, setLoading] = useState(!_cachedId);

  useEffect(() => {
    let alive = true;
    if (!_cachedId) {
      loadCurriculumId().then(id => {
        if (alive) { setCurriculumId(id); setLoading(false); }
      });
    } else {
      setLoading(false);
    }
    const refresh = () => setCurriculumId(_cachedId ?? DEFAULT_CURRICULUM_ID);
    _curriculumListeners.add(refresh);
    return () => { alive = false; _curriculumListeners.delete(refresh); };
  }, []);

  return { curriculum: getCurriculum(curriculumId), curriculumId, loading };
}
