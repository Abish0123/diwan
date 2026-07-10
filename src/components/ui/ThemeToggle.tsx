import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button onClick={toggleTheme} className="h-9 w-9 rounded-xl border border-border/50 bg-card/50 flex items-center justify-center hover:bg-secondary hover:border-primary/20 transition-all duration-200" aria-label="Toggle theme">
      {theme === "dark" ? <Sun className="h-4 w-4 text-muted-foreground" /> : <Moon className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
};
