import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe } from "lucide-react";

export const LanguageSwitcher = () => {
  const { language, setLang } = useLanguage();

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
          {language === "ar" ? "عربي" : "EN"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36" dir="ltr">
        <DropdownMenuItem
          onClick={() => setLang("en")}
          className={language === "en" ? "bg-accent" : ""}
        >
          <span className="mr-2 text-base leading-none">🇺🇸</span>
          <span className="flex-1">English</span>
          {language === "en" && <span className="text-primary text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLang("ar")}
          className={language === "ar" ? "bg-accent" : ""}
        >
          <span className="mr-2 text-base leading-none">🇸🇦</span>
          <span className="flex-1" style={{ fontFamily: "Cairo, sans-serif" }}>
            العربية
          </span>
          {language === "ar" && <span className="text-primary text-xs">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
