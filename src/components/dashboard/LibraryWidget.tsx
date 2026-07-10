import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";

interface Book {
  title: string;
  tags: string[];
}

export function LibraryWidget() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = (await smartDb.getAll("library")) as Record<string, unknown>[];
        if (!active) return;
        const mapped = rows.slice(0, 3).map((b) => ({
          title: String(b.title || "Untitled"),
          tags: [b.category, b.status].filter(Boolean).map(String),
        }));
        setBooks(mapped);
      } catch {
        if (active) setBooks([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const handleBookClick = (title: string) => {
    toast.info(`Book: ${title}`, {
      description: "Checking availability and reservation status.",
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7, duration: 0.4 }}
      className="premium-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground font-heading">Library</h3>
        <button 
          onClick={() => navigate("/library")}
          className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1"
        >
          View All <ArrowRight className="h-3 w-3" />
        </button>
      </div>
      {loading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
      ) : books.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">No books in the library yet.</div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {books.map((book, i) => (
          <div 
            key={book.title} 
            onClick={() => handleBookClick(book.title)}
            className="flex items-center gap-3 rounded-xl border border-border p-3 hover:border-primary/15 hover:shadow-sm transition-all duration-200 cursor-pointer"
          >
            <div className="h-11 w-9 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
              <BookOpen className="h-4 w-4 text-primary" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-foreground truncate">{book.title}</p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {book.tags.map((tag) => (
                  <span key={tag} className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      )}
    </motion.div>
  );
}
