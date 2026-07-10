import { CurriculumId } from "./curriculumConfig";

// Two enums have represented "which curriculum" without ever being
// reconciled: CurriculumId (src/lib/curriculumConfig.ts — drives gradebook
// bands/term structure) and ReportCard.tsx's TemplateId (drives the report
// card's visual template/grade scale). This is the map between them,
// factored out so both sides can depend on it instead of guessing.
//
// TemplateId is defined locally in ReportCard.tsx (not exported), so this
// module intentionally returns a plain string — ReportCard.tsx narrows it
// to its own TemplateId at the one call site that uses it, keeping this
// module free of a page-local type import.
const CURRICULUM_TO_TEMPLATE: Record<CurriculumId, string> = {
  cbse: "cbse",
  british: "british",
  ib: "ib",
  american: "american",
  qatar: "qatar",
  // These five don't have a dedicated report-card template today — "custom"
  // is the honest fallback (a generic template) rather than silently
  // reusing an unrelated board's template (e.g. CBSE) for a Lebanese or
  // Egyptian curriculum, which would mislabel the report card's board name.
  srilankan: "custom",
  pakistani: "custom",
  lebanese: "custom",
  egyptian: "custom",
  palestinian: "custom",
  sudanese: "custom",
};

// Factory: resolves the report-card template that matches a school's actual
// active curriculum, instead of defaulting to "primary" regardless of it
// (the previous behavior in ReportCard.tsx — a CBSE school could see a
// non-CBSE-styled report by default).
export function templateIdFromCurriculum(curriculumId: CurriculumId): string {
  return CURRICULUM_TO_TEMPLATE[curriculumId] ?? "custom";
}
