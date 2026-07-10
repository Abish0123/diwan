import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import type { GradebookBand, GradebookCategory } from "@/lib/curriculumConfig";

// Deterministic id per (curriculum, band) — one override row max per band, so
// saving twice upserts instead of accumulating duplicates.
function structureId(curriculumId: string, bandLabel: string): string {
  return `${curriculumId}__${bandLabel}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeCategories(raw: any): GradebookCategory[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(c => ({
    name: String(c?.name ?? "").trim() || "Untitled",
    count: c?.count === null || c?.count === undefined ? null : Number(c.count) || 0,
    marks: Number(c?.marks) || 0,
    isExam: c?.isExam === true,
  }));
}

/**
 * Curriculum defines the DEFAULT gradebook structure (categories + weights)
 * for a grade band. This hook layers a per-school override on top: if the
 * school has customized this band, use their version; otherwise fall back to
 * the curriculum's template. Curriculum guides the structure — it doesn't
 * permanently lock it.
 */
export function useGradebookStructure(curriculumId: string, band: GradebookBand | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const id = band ? structureId(curriculumId, band.label) : "";
  const queryKey = ["gradebook-structure", id];

  const { data: customCategories = null, isLoading: loading } = useQuery({
    queryKey,
    queryFn: () => smartDb.getOne("GradebookStructure", id).then((row: any) =>
      row?.categories ? normalizeCategories(row.categories) : null
    ),
    enabled: !!band,
  });

  const isCustomized = customCategories !== null;
  const effectiveCategories = customCategories ?? band?.categories ?? [];

  const saveStructure = useCallback(async (categories: GradebookCategory[]) => {
    if (!band) return;
    const clean = normalizeCategories(categories);
    const payload = {
      id, curriculumId, bandLabel: band.label, categories: clean,
      uid: user?.uid || "admin", updatedAt: new Date().toISOString(),
    };
    try {
      await smartDb.update("GradebookStructure", id, payload);
    } catch {
      await smartDb.create("GradebookStructure", payload, id);
    }
    queryClient.setQueryData(queryKey, clean);
  }, [id, band, curriculumId, user, queryClient]);

  const resetToDefault = useCallback(async () => {
    if (!band) return;
    await smartDb.delete("GradebookStructure", id).catch(() => {});
    queryClient.setQueryData(queryKey, null);
  }, [id, band, queryClient]);

  return { effectiveCategories, isCustomized, saveStructure, resetToDefault, loading };
}
