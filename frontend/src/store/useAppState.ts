import { useCallback, useEffect, useRef, useState } from "react";
import i18n from "../i18n";
import { api } from "../api/client";
import type { AppSettings, Server } from "../types";

const defaultSettings: AppSettings = {
  language: "en",
  theme: "dark",
  default_monitoring_interval_minutes: 5,
};

export function useAppState() {
  const [servers, setServers] = useState<Server[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    if (!hasLoaded.current) setLoading(true);
    setError(null);
    try {
      const [serverList, appSettings] = await Promise.all([api.listServers(), api.getSettings()]);
      setServers(serverList);
      setSettings(appSettings);
      await i18n.changeLanguage(appSettings.language);
      document.documentElement.classList.toggle("dark", appSettings.theme === "dark");
    } catch (err) {
      setError(err instanceof Error ? err.message : "request_failed");
    } finally {
      hasLoaded.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = useCallback(async (next: AppSettings) => {
    const saved = await api.updateSettings(next);
    setSettings(saved);
    await i18n.changeLanguage(saved.language);
    document.documentElement.classList.toggle("dark", saved.theme === "dark");
  }, []);

  return { servers, settings, saveSettings, loading, error, reload: load };
}
