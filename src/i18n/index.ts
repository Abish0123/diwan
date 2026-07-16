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
  // Global DOM auto-translation: covers every module/page even without t() calls.
  // Lazy import to avoid pulling the dictionary into the initial bundle for English users.
  if (isAr) {
    import('./autoTranslate').then((m) => m.startAutoTranslate());
  } else {
    import('./autoTranslate').then((m) => m.stopAutoTranslate());
  }
};

export const setLanguage = (lang: 'en' | 'ar') => {
  const prev = localStorage.getItem('lang') || 'en';
  localStorage.setItem('lang', lang);
  i18n.changeLanguage(lang);
  applyLang(lang);
  // Switching AR -> EN needs a reload to restore original English text that
  // the auto-translator replaced in the DOM.
  if (prev === 'ar' && lang === 'en') {
    window.location.reload();
  }
};

// Apply on load (after DOM is ready so the initial pass can walk the body)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => applyLang(saved));
} else {
  applyLang(saved);
}

export default i18n;
