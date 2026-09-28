import { useTranslation } from "react-i18next";

export default function OperatorNotice() {
  const { t } = useTranslation();
  return (
    <p className="mx-auto max-w-4xl px-4 py-3 text-center text-xs leading-relaxed text-base-content/80">
      {t("operator-notice")}
    </p>
  );
}
