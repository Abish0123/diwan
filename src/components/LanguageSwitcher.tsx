import { useTranslation } from "react-i18next";
import { setLanguage } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe } from "lucide-react";

export const LanguageSwitcher = () => {
  // useTranslation provides i18n.language and re-renders this component
  // whenever changeLanguage() is called, so current is always in sync.
  const { i18n } = useTranslation();
  const current = i18n.language?.startsWith("ar") ? "ar" : "en";

  const switchTo = (lang: "en" | "ar") => {
    setLanguage(lang);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs font-medium"
          aria-label="Switch language"
        >
          <Globe className="h-3.5 w-3.5" />
          {current === "ar" ? "عربي" : "EN"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36" dir="ltr">
        <DropdownMenuItem
          onClick={() => switchTo("en")}
          className={current === "en" ? "bg-accent" : ""}
        >
          <span className="mr-2 text-base leading-none">🇺🇸</span>
          <span className="flex-1">English</span>
          {current === "en" && <span className="text-primary text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => switchTo("ar")}
          className={current === "ar" ? "bg-accent" : ""}
        >
          <span className="mr-2 text-base leading-none">🇸🇦</span>
          <span className="flex-1" style={{ fontFamily: "Cairo, sans-serif" }}>
            العربية
          </span>
          {current === "ar" && <span className="text-primary text-xs">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
