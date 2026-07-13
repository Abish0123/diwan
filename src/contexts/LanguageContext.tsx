import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import i18n from "@/i18n";
import { setLanguage } from "@/i18n";

type Lang = "en" | "ar";

interface LanguageContextValue {
  language: Lang;
  setLang: (lang: Lang) => void;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  setLang: () => {},
  isRTL: false,
});

export const useLanguage = () => useContext(LanguageContext);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Lang>(
    () => (localStorage.getItem("lang") as Lang) || "en"
  );

  const setLang = (lang: Lang) => {
    setLanguage(lang); // updates i18n, dir attr, CSS var, localStorage
    setLanguageState(lang); // triggers React re-render of whole tree
  };

  // Keep in sync if something external calls i18n.changeLanguage()
  useEffect(() => {
    const handler = () => {
      const current = i18n.language?.startsWith("ar") ? "ar" : "en";
      setLanguageState(current);
    };
    i18n.on("languageChanged", handler);
    return () => { i18n.off("languageChanged", handler); };
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLang, isRTL: language === "ar" }}>
      {children}
    </LanguageContext.Provider>
  );
};
