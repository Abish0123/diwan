import { Link, useParams, Navigate } from "react-router-dom";
import * as Icons from "lucide-react";
import { ArrowRight, ChevronRight } from "lucide-react";
import { getCategory } from "@/lib/helpCenter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] || Icons.HelpCircle;
  return <Icon className={className} />;
}

export default function HelpCategory() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const category = categoryId ? getCategory(categoryId) : undefined;

  if (!category) return <Navigate to="/help" replace />;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/help" className="hover:text-foreground">Help Center</Link>
        <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
        <span className="text-foreground">{category.title}</span>
      </nav>

      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2.5">
          <CategoryIcon name={category.icon} className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{category.title}</h1>
          <p className="text-muted-foreground mt-1">{category.description}</p>
        </div>
      </div>

      {category.articles.length === 0 ? (
        <p className="text-sm text-muted-foreground">Articles for this module are coming soon.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {category.articles.map((a) => (
            <Link key={a.slug} to={`/help/${category.id}/${a.slug}`}>
              <Card className="p-4 h-full flex flex-col gap-1.5 hover:border-primary/50 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="font-medium">{a.title}</div>
                  {a.popular && <Badge variant="secondary" className="text-xs">Popular</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{a.summary}</p>
                <div className="mt-auto pt-1 flex items-center gap-1 text-xs text-primary">
                  Read article <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
