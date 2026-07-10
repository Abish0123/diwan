import { useState } from "react";
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
  const { i18n } = useTranslation();
  const [current, setCurrent] = useState(i18n.language || "en");

  const switchTo = (lang: "en" | "ar") => {
    setLanguage(lang);
    setCurrent(lang);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs font-medium">
          <Globe className="h-3.5 w-3.5" />
          {current === "ar" ? "عربي" : "EN"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem
          onClick={() => switchTo("en")}
          className={current === "en" ? "bg-accent" : ""}
        >
          <span className="mr-2 text-base">🇺🇸</span>
          <span className="flex-1">English</span>
          {current === "en" && <span className="text-primary text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => switchTo("ar")}
          className={current === "ar" ? "bg-accent" : ""}
        >
          <span className="mr-2 text-base">🇸🇦</span>
          <span className="flex-1" dir="rtl" style={{ fontFamily: "Cairo, sans-serif" }}>العربية</span>
          {current === "ar" && <span className="text-primary text-xs">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
