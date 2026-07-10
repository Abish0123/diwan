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

export const setLanguage = (lang: 'en' | 'ar') => {
  localStorage.setItem('lang', lang);
  i18n.changeLanguage(lang);
  document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.style.fontFamily = lang === 'ar' ? "'Cairo', 'Segoe UI', sans-serif" : '';
};

// Apply on load
document.documentElement.setAttribute('dir', saved === 'ar' ? 'rtl' : 'ltr');
document.documentElement.setAttribute('lang', saved);
if (saved === 'ar') document.documentElement.style.fontFamily = "'Cairo', 'Segoe UI', sans-serif";

export default i18n;
