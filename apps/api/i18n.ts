import i18next from "i18next";
import Backend from "i18next-fs-backend";
import * as Middleware from "i18next-http-middleware";
import path from "node:path";

i18next
    .use(Backend)
    .use(Middleware.LanguageDetector)
    .init({
        lng: "en",
        fallbackLng: "en",
        supportedLngs: ["en", "et"],
        backend: {
            loadPath: path.join(process.cwd(), "locales/{{lng}}.json")
        }
    });

export default i18next;
