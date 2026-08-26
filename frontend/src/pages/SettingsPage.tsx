import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Save } from "lucide-react";
import { ErrorBanner } from "../components/ErrorBanner";
import type { AppSettings } from "../types";

export function SettingsPage({
  settings,
  saveSettings,
}: {
  settings: AppSettings;
  saveSettings: (settings: AppSettings) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveSettings(form);
    } catch {
      setError(t("errors.saveSettings"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      {error && <ErrorBanner message={error} />}
      <form onSubmit={submit} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="field-label">{t("settings.language")}</span>
            <select className="input mt-1" value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value as AppSettings["language"] })}>
              <option value="en">{t("settings.english")}</option>
              <option value="hy">{t("settings.armenian")}</option>
              <option value="ru">{t("settings.russian")}</option>
            </select>
          </label>

          <label className="block">
            <span className="field-label">{t("settings.theme")}</span>
            <select className="input mt-1" value={form.theme} onChange={(event) => setForm({ ...form, theme: event.target.value as AppSettings["theme"] })}>
              <option value="dark">{t("settings.dark")}</option>
              <option value="light">{t("settings.light")}</option>
            </select>
          </label>

          <label className="block">
            <span className="field-label">{t("settings.monitoringInterval")}</span>
            <input
              className="input mt-1"
              type="number"
              min={1}
              max={1440}
              value={form.default_monitoring_interval_minutes}
              onChange={(event) => setForm({ ...form, default_monitoring_interval_minutes: Number(event.target.value) })}
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
