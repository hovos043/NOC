import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { Copy, RefreshCw, X } from "lucide-react";
import { api } from "../api/client";
import { ErrorBanner } from "./ErrorBanner";
import { StatusBadge } from "./StatusBadge";
import { TerminalPanel } from "./TerminalPanel";
import type { ConnectionHistory, MonitoringSnapshot, Server } from "../types";
import { formatLocalDateTime } from "../utils/date";

export function ServerDetails({ server, onClose, onChanged }: { server: Server; onClose: () => void; onChanged: () => Promise<void> }) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<MonitoringSnapshot | null>(null);
  const [history, setHistory] = useState<ConnectionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCodexContext, setCopiedCodexContext] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [latest, connectionHistory] = await Promise.all([api.latestMetrics(server.id), api.connectionHistory(server.id)]);
      setSnapshot(latest);
      setHistory(connectionHistory);
    } catch {
      setError(t("errors.loadMetrics"));
    } finally {
      setLoading(false);
    }
  }, [server.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const testSsh = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.testSsh(server.id);
      await onChanged();
      await load();
    } catch {
      setError(t("errors.testSsh"));
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.refreshServer(server.id);
      await onChanged();
      await load();
    } catch {
      setError(t("errors.refreshMetrics"));
    } finally {
      setBusy(false);
    }
  };

  const copyCodexContext = async () => {
    const text = t("codex.contextText", {
      id: server.id,
      displayName: server.display_name,
      hostname: server.hostname,
      sshStatus: server.ssh_status,
      whmStatus: server.whm_status,
    });
    await navigator.clipboard.writeText(text);
    setCopiedCodexContext(true);
    window.setTimeout(() => setCopiedCodexContext(false), 1600);
  };

  return (
    <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t("details.title", { hostname: server.hostname })}</h2>
          <p className="mt-1 text-sm text-slate-500">{server.ip_address || server.display_name}</p>
        </div>
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
          <X className="h-4 w-4" />
          {t("common.cancel")}
        </button>
      </div>

      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}
      {loading ? <div className="text-sm text-slate-500">{t("common.loading")}</div> : null}

      <div className="grid gap-4">
        <section className="rounded-md border border-slate-200 p-4 dark:border-slate-800">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">{t("details.connection")}</h3>
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={testSsh} disabled={busy}>
                {t("servers.testSsh")}
              </button>
              <button className="btn btn-primary" onClick={refresh} disabled={busy || !server.enabled}>
                <RefreshCw className="h-4 w-4" />
                {t("servers.refreshNow")}
              </button>
            </div>
          </div>
          <div className="grid gap-3 text-sm md:grid-cols-4">
            <Info label={t("dashboard.sshStatus")} value={<StatusBadge type={server.enabled ? server.ssh_status : "disabled"} />} />
            <Info label={t("details.lastTestTime")} value={formatLocalDateTime(server.last_ssh_test_at)} />
            <Info label={t("details.lastChecked")} value={formatLocalDateTime(server.last_checked_at)} />
            <Info label={t("details.lastError")} value={server.last_ssh_error ? t(`sshErrors.${server.last_ssh_error}`, { defaultValue: server.last_ssh_error }) : "-"} />
          </div>
        </section>

        <MetricSections snapshot={snapshot} />

        <section className="rounded-md border border-slate-200 p-4 dark:border-slate-800">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">{t("codex.contextTitle")}</h3>
            <button className="btn btn-secondary" onClick={() => void copyCodexContext()}>
              <Copy className="h-4 w-4" />
              {copiedCodexContext ? t("codex.copied") : t("codex.copyContext")}
            </button>
          </div>
          <div className="grid gap-3 text-sm md:grid-cols-4">
            <Info label={t("codex.serverId")} value={server.id} />
            <Info label={t("fields.displayName")} value={server.display_name} />
            <Info label={t("fields.hostname")} value={server.hostname} />
            <Info label={t("dashboard.sshStatus")} value={server.ssh_status} />
            <Info label={t("dashboard.whmStatus")} value={server.whm_status} />
          </div>
        </section>

        <TerminalPanel server={server} />

        <section className="rounded-md border border-slate-200 p-4 dark:border-slate-800">
          <h3 className="mb-3 font-semibold">{t("details.connectionHistory")}</h3>
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">{t("details.noHistory")}</p>
          ) : (
            <div className="space-y-2">
              {history.slice(0, 5).map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-slate-950">
                  <span>{item.success ? t("status.connected") : t(`sshErrors.${item.error_message}`, { defaultValue: item.error_message ?? t("status.failed") })}</span>
                  <span className="text-slate-500">{formatLocalDateTime(item.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MetricSections({ snapshot }: { snapshot: MonitoringSnapshot | null }) {
  const { t } = useTranslation();
  if (!snapshot) {
    return <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">{t("details.noMetrics")}</div>;
  }

  return (
    <>
      <section className="grid gap-3 rounded-md border border-slate-200 p-4 text-sm dark:border-slate-800 md:grid-cols-4">
        <Info label={t("details.systemHostname")} value={snapshot.hostname || "-"} />
        <Info label={t("details.os")} value={[snapshot.os_name, snapshot.os_version].filter(Boolean).join(" ") || "-"} />
        <Info label={t("details.kernel")} value={snapshot.kernel || "-"} />
        <Info label={t("details.uptime")} value={snapshot.uptime_text || "-"} />
      </section>
      <section className="grid gap-3 rounded-md border border-slate-200 p-4 text-sm dark:border-slate-800 md:grid-cols-4">
        <Info label={t("details.cpuModel")} value={snapshot.cpu_model || "-"} />
        <Info label={t("details.cpuCores")} value={formatValue(snapshot.cpu_cores)} />
        <Info label={t("details.loadAverage")} value={snapshot.load_average || "-"} />
        <Info label={t("details.cpuUsage")} value={formatPercent(snapshot.cpu_usage)} />
      </section>
      <section className="grid gap-3 rounded-md border border-slate-200 p-4 text-sm dark:border-slate-800 md:grid-cols-4">
        <Info label={t("details.ramTotal")} value={formatMb(snapshot.ram_total)} />
        <Info label={t("details.ramUsed")} value={formatMb(snapshot.ram_used)} />
        <Info label={t("details.ramFree")} value={formatMb(snapshot.ram_free)} />
        <Info label={t("details.ramUsage")} value={formatPercent(snapshot.ram_usage)} />
        <Info label={t("details.swapTotal")} value={formatMb(snapshot.swap_total)} />
        <Info label={t("details.swapUsed")} value={formatMb(snapshot.swap_used)} />
        <Info label={t("details.swapFree")} value={formatMb(snapshot.swap_free)} />
        <Info label={t("details.swapUsage")} value={formatPercent(snapshot.swap_usage)} />
      </section>
      <section className="rounded-md border border-slate-200 p-4 dark:border-slate-800">
        <h3 className="mb-3 font-semibold">{t("details.disk")}</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2">{t("details.filesystem")}</th>
              <th>{t("details.size")}</th>
              <th>{t("details.used")}</th>
              <th>{t("details.available")}</th>
              <th>{t("details.usage")}</th>
              <th>{t("details.mountPoint")}</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.disks.map((disk) => (
              <tr key={`${disk.filesystem}-${disk.mount_point}`} className="border-t border-slate-200 dark:border-slate-800">
                <td className="py-2">{disk.filesystem}</td>
                <td>{disk.size}</td>
                <td>{disk.used}</td>
                <td>{disk.available}</td>
                <td>{formatPercent(disk.usage_percent)}</td>
                <td>{disk.mount_point}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="field-label">{label}</div>
      <div className="mt-1 text-slate-700 dark:text-slate-200">{value}</div>
    </div>
  );
}

function formatPercent(value: number | null) {
  return value === null ? "-" : `${value}%`;
}

function formatMb(value: number | null) {
  return value === null ? "-" : `${value} MB`;
}

function formatValue(value: string | number | null) {
  return value === null ? "-" : String(value);
}
