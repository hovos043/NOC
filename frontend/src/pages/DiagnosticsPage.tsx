import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { ErrorBanner } from "../components/ErrorBanner";
import { StatusBadge } from "../components/StatusBadge";
import type { Diagnostics } from "../types";
import { formatLocalDateTime } from "../utils/date";

export function DiagnosticsPage() {
  const { t } = useTranslation();
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setDiagnostics(await api.diagnostics());
    } catch {
      setError(t("errors.loadDiagnostics"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading && !diagnostics) return <div className="text-sm text-slate-500">{t("common.loading")}</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {t("diagnostics.refresh")}
        </button>
      </div>
      {error && <ErrorBanner message={error} />}
      {diagnostics && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DiagnosticCard label={t("diagnostics.backend")} value={`${diagnostics.backend_host}:${diagnostics.backend_port}`} detail={`PID ${diagnostics.backend_pid}`} />
            <DiagnosticCard label={t("diagnostics.schema")} value={diagnostics.schema_version} detail={diagnostics.status} />
            <DiagnosticCard label={t("diagnostics.servers")} value={`${diagnostics.enabled_servers_count}/${diagnostics.servers_count}`} detail={t("diagnostics.enabledTotal")} />
            <DiagnosticCard label={t("diagnostics.accounts")} value={String(diagnostics.accounts_count)} detail={t("diagnostics.localRecords")} />
          </div>

          <section className="panel-surface p-4">
            <h2 className="text-sm font-semibold uppercase text-slate-500">{t("diagnostics.storage")}</h2>
            <dl className="mt-3 grid gap-3 text-sm lg:grid-cols-2">
              <Info label={t("diagnostics.databasePath")} value={diagnostics.database_path || "-"} />
              <Info label={t("diagnostics.latestBackup")} value={diagnostics.latest_backup || "-"} />
              <Info label={t("diagnostics.auditLogs")} value={String(diagnostics.audit_logs_count)} />
              <Info label={t("diagnostics.commandHistory")} value={String(diagnostics.command_history_count)} />
            </dl>
          </section>

          <section className="overflow-x-auto panel-surface">
            <table className="w-full min-w-[820px] table-fixed border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900/70 dark:text-slate-400">
                <tr>
                  <th className="w-48 px-3 py-3">{t("diagnostics.server")}</th>
                  <th className="w-32 px-3 py-3 text-center">{t("dashboard.sshStatus")}</th>
                  <th className="w-32 px-3 py-3 text-center">{t("dashboard.whmStatus")}</th>
                  <th className="w-48 px-3 py-3">{t("diagnostics.lastWhmError")}</th>
                  <th className="w-40 px-3 py-3">{t("accounts.lastSync")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {diagnostics.servers.map((server) => (
                  <tr key={server.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/60">
                    <td className="truncate px-3 py-3 font-medium" title={server.hostname}>{server.display_name || server.hostname}</td>
                    <td className="px-3 py-3 text-center"><StatusBadge type={server.enabled ? server.ssh_status : "disabled"} /></td>
                    <td className="px-3 py-3 text-center"><StatusBadge type={server.enabled ? server.whm_status : "disabled"} /></td>
                    <td className="truncate px-3 py-3">{server.last_whm_error || "-"}</td>
                    <td className="truncate px-3 py-3 tabular-nums">{formatLocalDateTime(server.last_account_sync_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function DiagnosticCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="stat-card">
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-2 truncate text-2xl font-semibold tabular-nums" title={value}>{value}</div>
      <div className="mt-1 truncate text-xs text-slate-500" title={detail}>{detail}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="field-label">{label}</dt>
      <dd className="mt-1 truncate text-slate-800 dark:text-slate-100" title={value}>{value}</dd>
    </div>
  );
}
