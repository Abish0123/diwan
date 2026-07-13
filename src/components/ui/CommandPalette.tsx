import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowRight, BookOpen, Users, DollarSign, Settings, Calendar, GraduationCap, LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAllArticles } from "@/lib/helpCenter";

type CommandItem = {
  title: string;
  path: string;
  category: string;
};

const ALL_ITEMS: CommandItem[] = [
  { title: "Dashboard", path: "/", category: "Pages" },
  { title: "Students", path: "/students", category: "Pages" },
  { title: "Finance & Fees", path: "/finance/fees", category: "Pages" },
  { title: "Staff", path: "/hr/staff", category: "Pages" },
  { title: "Timetable", path: "/timetable", category: "Pages" },
  { title: "Gradebook", path: "/academics/gradebook", category: "Pages" },
  { title: "Report Cards", path: "/academics/report-cards", category: "Pages" },
  { title: "Parent Portal", path: "/portals/parent", category: "Pages" },
  { title: "Attendance", path: "/attendance", category: "Pages" },
  { title: "Library", path: "/library", category: "Pages" },
  { title: "Admissions", path: "/admissions", category: "Pages" },
  { title: "Settings", path: "/settings/academic", category: "Pages" },
  { title: "Help Center", path: "/help", category: "Pages" },
  ...getAllArticles().map((a) => ({
    title: a.title,
    path: `/help/${a.categoryId}/${a.slug}`,
    category: "Help",
  })),
];

const CATEGORY_COLORS: Record<string, string> = {
  Pages: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  Students: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Staff: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  Finance: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  Help: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
};

const getCategoryIcon = (category: string) => {
  switch (category) {
    case "Students": return <Users className="h-4 w-4" />;
    case "Staff": return <GraduationCap className="h-4 w-4" />;
    case "Finance": return <DollarSign className="h-4 w-4" />;
    case "Pages": return <BookOpen className="h-4 w-4" />;
    case "Help": return <LifeBuoy className="h-4 w-4" />;
    default: return <Settings className="h-4 w-4" />;
  }
};

export const CommandPalette = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = ALL_ITEMS.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.path.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = useCallback(
    (item: CommandItem) => {
      navigate(item.path);
      onClose();
      setQuery("");
      setSelectedIndex(0);
    },
    [navigate, onClose]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (!isOpen) {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSelectedIndex(0);
      return;
    }
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          handleSelect(filtered[selectedIndex]);
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filtered, selectedIndex, handleSelect, onClose]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-card rounded-2xl shadow-2xl p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search students, staff, pages…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground text-foreground"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Clear
            </button>
          )}
        </div>

        <div ref={listRef} className="overflow-y-auto max-h-96 p-2">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No results found.
            </div>
          ) : (
            filtered.map((item, index) => (
              <div
                key={item.path}
                onClick={() => handleSelect(item)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors",
                  index === selectedIndex
                    ? "bg-secondary"
                    : "hover:bg-secondary/60"
                )}
              >
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full shrink-0",
                    CATEGORY_COLORS[item.category] ?? "bg-muted text-muted-foreground"
                  )}
                >
                  {getCategoryIcon(item.category)}
                  {item.category}
                </span>
                <span className="flex-1 text-sm font-medium text-foreground truncate">
                  {item.title}
                </span>
                <span className="text-xs text-muted-foreground truncate hidden sm:block">
                  {item.path}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted font-mono">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted font-mono">↵</kbd>
            open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted font-mono">Esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
};
