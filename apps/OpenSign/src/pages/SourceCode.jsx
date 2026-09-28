import { useTranslation } from "react-i18next";

const repositoryUrl = "https://github.com/webfreakjp/OpenSign";
const sourceBranch = "ja-self-host";

export default function SourceCode() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-base-content">
      <h1 className="mb-6 text-2xl font-semibold">{t("source-code")}</h1>
      <p className="mb-4 leading-relaxed">{t("source-code-description")}</p>
      <a
        className="op-link op-link-primary"
        href={`${repositoryUrl}/tree/${sourceBranch}`}
      >
        {t("source-code-on-github")}
      </a>
      <p className="mt-8 mb-3 leading-relaxed">{t("source-code-license")}</p>
      <a
        className="op-link op-link-primary"
        href={`${repositoryUrl}/blob/${sourceBranch}/LICENSE`}
      >
        GNU Affero General Public License v3.0
      </a>
      <p className="mt-4 text-sm leading-relaxed">
        {t("source-code-warranty")}
      </p>
    </main>
  );
}
