import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  LANGUAGE_OPTIONS,
  TRANSLATIONS,
  type AppLanguage,
  type TranslationDict,
} from '../i18n/translations';

const STORAGE_LANG_KEY = 'cuentasclaras_lang_v1';

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  t: TranslationDict;
  speechLocale: string;
  mapsLanguage: string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function isSupportedLanguage(value: string | null): value is AppLanguage {
  return value === 'es' || value === 'en' || value === 'fr' || value === 'zh' || value === 'ru';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_LANG_KEY);
      if (isSupportedLanguage(saved)) return saved;
    } catch {
      // Ignore storage read failure
    }
    return 'es';
  });

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : language;
    try {
      localStorage.setItem(STORAGE_LANG_KEY, language);
    } catch {
      // Ignore storage quota failure
    }
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => {
    const meta =
      LANGUAGE_OPTIONS.find((opt) => opt.code === language) || LANGUAGE_OPTIONS[0];
    return {
      language,
      setLanguage: setLanguageState,
      t: TRANSLATIONS[language] as TranslationDict,
      speechLocale: meta.speechLang,
      mapsLanguage: meta.mapsLang,
    };
  }, [language]);

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}
