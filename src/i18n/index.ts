import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ar from './locales/ar.json';

const saved = localStorage.getItem('lang') || 'en';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: saved,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

const applyLang = (lang: string) => {
  const isAr = lang === 'ar';
  document.documentElement.setAttribute('dir', isAr ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', lang);
  // Switch the Tailwind --font-sans token so every font-sans class renders Cairo in Arabic
  document.documentElement.style.setProperty(
    '--font-sans',
    isAr ? "'Cairo', 'Segoe UI', sans-serif" : "'Inter', ui-sans-serif, system-ui, sans-serif"
  );
};

export const setLanguage = (lang: 'en' | 'ar') => {
  localStorage.setItem('lang', lang);
  i18n.changeLanguage(lang);
  applyLang(lang);
};

// Apply on load
applyLang(saved);

export default i18n;
