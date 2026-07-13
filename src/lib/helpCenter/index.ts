import type { HelpArticle, HelpCategory } from "./types";
import { HELP_CATEGORIES } from "./categories";
import { studentManagementArticles } from "./articles/studentManagement";
import { academicsArticles } from "./articles/academics";
import { examinationsArticles } from "./articles/examinations";
import { reportsArticles } from "./articles/reports";
import { teachingLearningArticles } from "./articles/teachingLearning";
import { staffHrArticles } from "./articles/staffHr";
import { financeArticles } from "./articles/finance";
import { communicationArticles } from "./articles/communication";
import { transportArticles } from "./articles/transport";
import { hostelCafeteriaArticles } from "./articles/hostelCafeteria";
import { securityArticles } from "./articles/security";
import { inventoryArticles } from "./articles/inventory";
import { intelligenceArticles } from "./articles/intelligence";
import { multiBranchArticles } from "./articles/multiBranch";
import { administrationArticles } from "./articles/administration";

const ARTICLES_BY_CATEGORY: Record<string, HelpArticle[]> = {
  "student-management": studentManagementArticles,
  "academics": academicsArticles,
  "examinations": examinationsArticles,
  "reports": reportsArticles,
  "teaching-learning": teachingLearningArticles,
  "staff-hr": staffHrArticles,
  "finance": financeArticles,
  "communication": communicationArticles,
  "transport": transportArticles,
  "hostel-cafeteria": hostelCafeteriaArticles,
  "security": securityArticles,
  "inventory": inventoryArticles,
  "intelligence": intelligenceArticles,
  "multi-branch": multiBranchArticles,
  "administration": administrationArticles,
};

export const HELP_CENTER: HelpCategory[] = HELP_CATEGORIES.map((cat) => ({
  ...cat,
  articles: ARTICLES_BY_CATEGORY[cat.id] || [],
}));

export function getCategory(categoryId: string): HelpCategory | undefined {
  return HELP_CENTER.find((c) => c.id === categoryId);
}

export function getArticle(categoryId: string, slug: string): HelpArticle | undefined {
  return getCategory(categoryId)?.articles.find((a) => a.slug === slug);
}

export interface FlatArticle extends HelpArticle {
  categoryId: string;
  categoryTitle: string;
}

export function getAllArticles(): FlatArticle[] {
  return HELP_CENTER.flatMap((cat) =>
    cat.articles.map((a) => ({ ...a, categoryId: cat.id, categoryTitle: cat.title }))
  );
}

export function getPopularArticles(limit = 6): FlatArticle[] {
  return getAllArticles().filter((a) => a.popular).slice(0, limit);
}

/** Simple case-insensitive substring search across title/summary/keywords. */
export function searchArticles(query: string): FlatArticle[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return getAllArticles().filter((a) => {
    const haystack = [a.title, a.summary, a.categoryTitle, ...(a.keywords || [])].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

export type { HelpArticle, HelpCategory };
