import { Link, useParams, Navigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronRight } from "lucide-react";
import { getArticle, getCategory } from "@/lib/helpCenter";
import { Badge } from "@/components/ui/badge";

export default function HelpArticle() {
  const { categoryId, slug } = useParams<{ categoryId: string; slug: string }>();
  const category = categoryId ? getCategory(categoryId) : undefined;
  const article = category && slug ? getArticle(category.id, slug) : undefined;

  if (!category || !article) return <Navigate to="/help" replace />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground mb-6">
        <Link to="/help" className="hover:text-foreground">Help Center</Link>
        <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
        <Link to={`/help/${category.id}`} className="hover:text-foreground">{category.title}</Link>
        <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
        <span className="text-foreground">{article.title}</span>
      </nav>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-2xl font-semibold tracking-tight">{article.title}</h1>
          {article.popular && <Badge variant="secondary" className="text-xs">Popular</Badge>}
        </div>
        <p className="text-muted-foreground">{article.summary}</p>
      </div>

      <article
        className="prose prose-sm sm:prose-base dark:prose-invert max-w-none
          prose-headings:font-semibold prose-h2:text-lg prose-h3:text-base
          prose-a:text-primary prose-blockquote:border-s-primary prose-blockquote:not-italic
          prose-blockquote:bg-primary/5 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-e-md"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.content}</ReactMarkdown>
      </article>
    </div>
  );
}
