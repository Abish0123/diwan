// Content model for the in-app Help Center (src/pages/help/*). Plain data,
// no CMS — each category lives in its own file under ./articles/ so the
// registry (index.ts) never has more than one contributor's work in a
// single file.

export interface HelpArticle {
  /** Unique within its category; forms the URL /help/:categoryId/:slug */
  slug: string;
  title: string;
  /** One-line description shown in listings and search results. */
  summary: string;
  /** Markdown body (rendered via react-markdown + remark-gfm). */
  content: string;
  /** Lowercased search keywords beyond title/summary (synonyms, feature names). */
  keywords?: string[];
  /** Shown in the Help Center home page's "Popular articles" rail. */
  popular?: boolean;
}

export interface HelpCategory {
  id: string;
  title: string;
  /** Short description shown on the category card / header. */
  description: string;
  /** lucide-react icon component name, resolved in HelpHome/HelpCategory. */
  icon: string;
  articles: HelpArticle[];
}
