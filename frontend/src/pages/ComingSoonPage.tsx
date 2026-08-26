import { useTranslation } from "react-i18next";

export function ComingSoonPage({ title }: { title: string }) {
  const { t } = useTranslation();

  return (
    <div className="rounded-md border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("common.comingSoon")}</p>
    </div>
  );
}
