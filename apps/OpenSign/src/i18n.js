import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import Backend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";

i18n
  .use(Backend)
  .use(LanguageDetector) // Use LanguageDetector directly without creating an instance
  .use(initReactI18next)
  .init({
    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.json"
    },
    fallbackLng: "ja",
    load: "languageOnly",
    detection: {
      // Specifies the default language to fall back to if the detected language is not available.
      order: ["localStorage", "navigator"],
      // Defines where the detected language should be cached.
      caches: ["localStorage"]
    },
    ns: ["translation"], // default namespace
    defaultNS: "translation", // default namespace
    //Enables debug mode, which outputs detailed logs to the console about the translation process.
    debug: false,
    interpolation: {
      escapeValue: false // Not needed for react as it escapes by default
    },
    supportedLngs: ["ja", "en", "es", "fr", "it", "de", "hi", "kr"] // List of allowed languages
  });

i18n.on("languageChanged", (language) => {
  document.documentElement.lang = language;
});

export default i18n;
