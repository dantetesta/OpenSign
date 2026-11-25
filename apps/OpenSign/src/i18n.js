import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import Backend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  LANGUAGE_STORAGE_KEY
} from "./constant/language";

i18n.on("languageChanged", (language) => {
  document.documentElement.lang = language === "kr" ? "ko" : language;
});

i18n
  .use(Backend)
  .use(LanguageDetector) // Use LanguageDetector directly without creating an instance
  .use(initReactI18next)
  .init({
    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.json"
    },
    supportedLngs: LANGUAGES.map(({ value }) => value),
    fallbackLng: { default: [DEFAULT_LANGUAGE, "en"], [DEFAULT_LANGUAGE]: ["en"] },
    load: "currentOnly",
    detection: {
      order: ["localStorage"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"]
    },
    ns: ["translation"], // default namespace
    defaultNS: "translation", // default namespace
    //Enables debug mode, which outputs detailed logs to the console about the translation process.
    debug: false,
    interpolation: {
      escapeValue: false // Not needed for react as it escapes by default
    }
  });

export default i18n;
