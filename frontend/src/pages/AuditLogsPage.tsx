import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { ErrorBanner } from "../components/ErrorBanner";
import type { AuditLog } from "../types";
import { formatLocalDateTime } from "../utils/date";

export function AuditLogsPage() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        setLogs(await api.listAuditLogs());
      } catch {
        setError(t("errors.loadAuditLogs"));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [t]);

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} />}
      {loading ? (
        <div className="text-sm text-slate-500">{t("common.loading")}</div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[980px] table-fixed border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="w-36 px-3 py-3">{t("audit.createdAt")}</th>
                <th className="w-40 px-3 py-3">{t("audit.hostname")}</th>
                <th className="w-24 px-3 py-3">{t("audit.username")}</th>
                <th className="w-48 px-3 py-3">{t("audit.command")}</th>
                <th className="w-24 px-3 py-3">{t("audit.status")}</th>
                <th className="w-20 px-3 py-3">{t("audit.exitCode")}</th>
                <th className="w-24 px-3 py-3">{t("audit.duration")}</th>
                <th className="w-24 px-3 py-3">{t("audit.dangerous")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="truncate px-3 py-3 tabular-nums">{formatLocalDateTime(log.created_at)}</td>
                  <td className="truncate px-3 py-3">{log.hostname || "-"}</td>
                  <td className="truncate px-3 py-3">{log.username || "-"}</td>
                  <td className="truncate px-3 py-3 font-mono" title={log.command || ""}>{log.command || "-"}</td>
                  <td className="truncate px-3 py-3">{log.status}</td>
                  <td className="truncate px-3 py-3 tabular-nums">{log.exit_code ?? "-"}</td>
                  <td className="truncate px-3 py-3 tabular-nums">{log.duration_ms ?? "-"} ms</td>
                  <td className="truncate px-3 py-3">{log.is_dangerous ? t("common.yes") : t("common.no")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
