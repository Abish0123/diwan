import { Link, useNavigate } from "react-router-dom";
import * as Icons from "lucide-react";
import { Search, ArrowRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { HELP_CENTER, getPopularArticles, searchArticles } from "@/lib/helpCenter";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] || Icons.HelpCircle;
  return <Icon className={className} />;
}

export default function HelpHome() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const popular = getPopularArticles(6);
  const results = query.trim() ? searchArticles(query).slice(0, 8) : [];
  const totalArticles = HELP_CENTER.reduce((n, c) => n + c.articles.length, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-10">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          {totalArticles} articles across {HELP_CENTER.length} modules
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">How can we help?</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Search the Help Center or browse by module to learn how to use any part of Student Diwan.
        </p>
        <div className="relative max-w-xl mx-auto">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles… e.g. purchase approvals, timetable, gate pass"
            className="ps-9 h-12 text-base"
            autoFocus
          />
        </div>

        {results.length > 0 && (
          <div className="max-w-xl mx-auto text-start rounded-lg border divide-y bg-card overflow-hidden">
            {results.map((a) => (
              <button
                key={`${a.categoryId}-${a.slug}`}
                onClick={() => navigate(`/help/${a.categoryId}/${a.slug}`)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/60 text-start"
              >
                <div>
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="text-xs text-muted-foreground">{a.categoryTitle} · {a.summary}</div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
        {query.trim() && results.length === 0 && (
          <p className="text-sm text-muted-foreground">No articles match "{query}". Try a different term.</p>
        )}
      </div>

      {!query.trim() && popular.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Popular articles</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {popular.map((a) => (
              <Link key={`${a.categoryId}-${a.slug}`} to={`/help/${a.categoryId}/${a.slug}`}>
                <Card className="p-4 h-full hover:border-primary/50 transition-colors">
                  <div className="text-xs text-muted-foreground mb-1">{a.categoryTitle}</div>
                  <div className="font-medium">{a.title}</div>
                  <div className="text-sm text-muted-foreground mt-1">{a.summary}</div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!query.trim() && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Browse by module</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {HELP_CENTER.map((cat) => (
              <Link key={cat.id} to={`/help/${cat.id}`}>
                <Card className="p-4 h-full flex flex-col gap-2 hover:border-primary/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <CategoryIcon name={cat.icon} className="h-4 w-4 text-primary" />
                    <div className="font-medium">{cat.title}</div>
                    <Badge variant="secondary" className="ms-auto text-xs">{cat.articles.length}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{cat.description}</p>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
