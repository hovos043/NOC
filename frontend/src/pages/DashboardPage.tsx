import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, RefreshCw, Settings, Trash2 } from "lucide-react";
import { ApiError, api } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { ServerDetails } from "../components/ServerDetails";
import { ServerForm } from "../components/ServerForm";
import { StatusBadge } from "../components/StatusBadge";
import { useConfirmDialog } from "../components/ConfirmDialog";
import type { MonitoringSnapshot, Server, ServerPayload } from "../types";
import { formatLocalDateTime } from "../utils/date";

type DashboardFormMode = "details" | "edit" | null;

export function DashboardPage({
  servers,
  reload,
  monitoringIntervalMinutes,
  onOpenAccounts,
}: {
  servers: Server[];
  reload: () => Promise<void>;
  monitoringIntervalMinutes: number;
  onOpenAccounts: (serverId: number) => void;
}) {
  const { t } = useTranslation();
  const [formMode, setFormMode] = useState<DashboardFormMode>(null);
  const [selectedServer, setSelectedServer] = useState<Server | undefined>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [formActionMessage, setFormActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [busyServerId, setBusyServerId] = useState<number | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<Record<number, MonitoringSnapshot | null>>({});
  const { confirm, dialog } = useConfirmDialog();
  const refreshInProgress = useRef(false);
  const autoRefreshTimeout = useRef<number | null>(null);
  const normalizedIntervalMinutes = Math.max(monitoringIntervalMinutes || 1, 1);
  const autoRefreshIntervalSeconds = normalizedIntervalMinutes * 60;
  const [nextAutoRefreshAt, setNextAutoRefreshAt] = useState(() => Date.now() + autoRefreshIntervalSeconds * 1000);
  const [countdownSeconds, setCountdownSeconds] = useState(autoRefreshIntervalSeconds);
  const refreshDisabled = refreshingAll || autoRefreshing;

  const loadMetrics = useCallback(async () => {
    const pairs = await Promise.all(servers.map(async (server) => [server.id, await api.latestMetrics(server.id)] as const));
    setMetrics(Object.fromEntries(pairs));
  }, [servers]);

  useEffect(() => {
    if (servers.length > 0) {
      void loadMetrics();
    } else {
      setMetrics({});
    }
  }, [loadMetrics, servers.length]);

  const openServerForm = (mode: Exclude<DashboardFormMode, null>, server: Server) => {
    setActionError(null);
    setFormActionMessage(null);
    setSelectedServer(server);
    setFormMode(mode);
  };

  const closeServerForm = () => {
    setSelectedServer(undefined);
    setFormMode(null);
    setFormActionMessage(null);
  };

  const saveServer = async (payload: ServerPayload) => {
    if (!selectedServer) return;
    setActionError(null);
    setBusyServerId(selectedServer.id);
    try {
      await api.updateServer(selectedServer.id, payload);
      closeServerForm();
      await reload();
    } catch {
      setActionError(t("errors.saveServer"));
    } finally {
      setBusyServerId(null);
    }
  };

  const saveSelectedForAction = async (payload: ServerPayload) => {
    if (!selectedServer) return undefined;
    setBusyServerId(selectedServer.id);
    const saved = await api.updateServer(selectedServer.id, payload);
    setSelectedServer(saved);
    return saved;
  };

  const actionFailureMessage = (fallbackKey: string, error: unknown, namespace: "sshErrors" | "whmErrors" = "sshErrors") => {
    if (error instanceof ApiError) {
      return error.detail ? t(`${namespace}.${error.detail}`, { defaultValue: error.detail }) : t(fallbackKey);
    }
    return t(fallbackKey);
  };

  const deleteServer = async (server: Server) => {
    const confirmed = await confirm({
      title: t("confirm.deleteServerTitle"),
      message: t("servers.confirmDelete", { hostname: server.hostname }),
      warning: t("confirm.deleteServerWarning"),
      confirmLabel: t("common.delete"),
    });
    if (!confirmed) return;
    setActionError(null);
    setBusyServerId(server.id);
    try {
      await api.deleteServer(server.id);
      await reload();
    } catch {
      setActionError(t("errors.deleteServer"));
    } finally {
      setBusyServerId(null);
    }
  };

  const resetAutoRefreshCountdown = useCallback((delaySeconds = autoRefreshIntervalSeconds) => {
    const nextRun = Date.now() + delaySeconds * 1000;
    setNextAutoRefreshAt(nextRun);
    setCountdownSeconds(delaySeconds);
  }, [autoRefreshIntervalSeconds]);

  const refreshEnabled = useCallback(async (source: "manual" | "auto" = "manual") => {
    if (refreshInProgress.current) return false;
    refreshInProgress.current = true;
    setActionError(null);
    if (source === "auto") {
      setAutoRefreshing(true);
    } else {
      setRefreshingAll(true);
    }
    try {
      await api.refreshEnabled();
      await reload();
      await loadMetrics();
      resetAutoRefreshCountdown();
      return true;
    } catch {
      setActionError(t("errors.refreshMetrics"));
      resetAutoRefreshCountdown();
      return false;
    } finally {
      refreshInProgress.current = false;
      setRefreshingAll(false);
      setAutoRefreshing(false);
    }
  }, [loadMetrics, reload, resetAutoRefreshCountdown, t]);

  useEffect(() => {
    resetAutoRefreshCountdown();
  }, [resetAutoRefreshCountdown]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdownSeconds(Math.max(0, Math.ceil((nextAutoRefreshAt - Date.now()) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [nextAutoRefreshAt]);

  useEffect(() => {
    if (autoRefreshTimeout.current) {
      window.clearTimeout(autoRefreshTimeout.current);
      autoRefreshTimeout.current = null;
    }
    if (servers.length === 0) return;
    const delayMs = Math.max(1000, nextAutoRefreshAt - Date.now());
    autoRefreshTimeout.current = window.setTimeout(() => {
      void (async () => {
        const refreshed = await refreshEnabled("auto");
        if (!refreshed) {
          resetAutoRefreshCountdown(10);
        }
      })();
    }, delayMs);
    return () => {
      if (autoRefreshTimeout.current) {
        window.clearTimeout(autoRefreshTimeout.current);
        autoRefreshTimeout.current = null;
      }
    };
  }, [nextAutoRefreshAt, refreshEnabled, resetAutoRefreshCountdown, servers.length]);

  const refreshServer = async (server: Server) => {
    if (refreshInProgress.current) return;
    refreshInProgress.current = true;
    setActionError(null);
    setBusyServerId(server.id);
    try {
      await api.refreshServer(server.id);
      await reload();
      const latest = await api.latestMetrics(server.id);
      setMetrics((current) => ({ ...current, [server.id]: latest }));
      resetAutoRefreshCountdown();
    } catch {
      setActionError(t("errors.refreshMetrics"));
      resetAutoRefreshCountdown();
    } finally {
      refreshInProgress.current = false;
      setBusyServerId(null);
    }
  };

  return (
    <div className="space-y-4">
      {actionError && <ErrorBanner message={actionError} />}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="text-sm text-slate-500 dark:text-slate-400" title={t("dashboard.autoRefreshInterval", { minutes: normalizedIntervalMinutes })}>
          {t("dashboard.nextAutoRefresh", { time: formatCountdown(countdownSeconds) })}
        </span>
        <button className="btn btn-primary" onClick={() => void refreshEnabled("manual")} disabled={refreshDisabled}>
          <RefreshCw className={`h-4 w-4 ${refreshDisabled ? "animate-spin" : ""}`} />
          {autoRefreshing ? t("dashboard.autoRefreshing") : refreshingAll ? t("dashboard.refreshing") : t("servers.refreshNow")}
        </button>
      </div>
      {servers.length === 0 ? (
        <EmptyState title={t("dashboard.emptyTitle")} description={t("dashboard.emptyDescription")} />
      ) : (
        <div className="overflow-x-auto panel-surface">
          <table className="w-full min-w-[1250px] table-fixed border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="w-40 px-3 py-3">{t("dashboard.hostname")}</th>
                <th className="w-28 px-3 py-3">{t("dashboard.ipAddress")}</th>
                <th className="w-28 px-3 py-3 text-center">{t("dashboard.sshStatus")}</th>
                <th className="w-28 px-3 py-3 text-center">{t("dashboard.whmStatus")}</th>
                <th className="w-24 px-3 py-3 text-center">{t("dashboard.accounts")}</th>
                <th className="w-24 px-3 py-3 text-center">{t("dashboard.uptime")}</th>
                <th className="w-36 px-3 py-3 text-center">{t("dashboard.loadAverage")}</th>
                <th className="w-20 px-3 py-3 text-center">{t("dashboard.cpuUsage")}</th>
                <th className="w-20 px-3 py-3 text-center">{t("dashboard.ramUsage")}</th>
                <th className="w-20 px-3 py-3 text-center">{t("dashboard.swapUsage")}</th>
                <th className="w-24 px-3 py-3 text-center">{t("dashboard.highestDisk")}</th>
                <th className="w-32 px-3 py-3 text-center">{t("dashboard.lastChecked")}</th>
                <th className="sticky right-0 w-40 bg-slate-50 px-3 py-3 text-right dark:bg-slate-900">{t("dashboard.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {servers.map((server) => (
                <tr key={server.id} className="hover:bg-slate-50 dark:hover:bg-slate-950">
                  <td className="truncate px-3 py-3 font-medium" title={server.hostname}>{server.hostname}</td>
                  <td className="truncate px-3 py-3 text-slate-600 dark:text-slate-300">{server.ip_address || "-"}</td>
                  <td className="px-3 py-3 text-center">
                    <StatusBadge type={server.enabled ? server.ssh_status : "disabled"} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <StatusBadge type={server.enabled ? server.whm_status : "disabled"} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-center tabular-nums">
                    {server.enabled ? (
                      <button className="rounded px-2 py-1 font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-slate-800" onClick={() => onOpenAccounts(server.id)}>
                        <span className="inline-flex items-center gap-1 tabular-nums" title={t("accounts.totalSuspendedHint")}>
                          <span>{server.accounts_count}</span>
                          <span className="text-slate-400">/</span>
                          <span className={server.suspended_accounts_count > 0 ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}>
                            {server.suspended_accounts_count}
                          </span>
                        </span>
                      </button>
                    ) : (
                      t("status.disabled")
                    )}
                  </td>
                  <td className="truncate whitespace-nowrap px-3 py-3 text-center tabular-nums">{server.enabled ? metrics[server.id]?.uptime_text || t("common.na") : t("status.disabled")}</td>
                  <td className="truncate whitespace-nowrap px-3 py-3 text-center tabular-nums">{server.enabled ? metrics[server.id]?.load_average || t("common.na") : t("status.disabled")}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-center tabular-nums">{server.enabled ? formatPercent(metrics[server.id]?.cpu_usage, t("common.na")) : t("status.disabled")}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-center tabular-nums">{server.enabled ? formatPercent(metrics[server.id]?.ram_usage, t("common.na")) : t("status.disabled")}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-center tabular-nums">{server.enabled ? formatPercent(metrics[server.id]?.swap_usage, t("common.na")) : t("status.disabled")}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-center tabular-nums">{server.enabled ? formatPercent(metrics[server.id]?.disk_highest_usage, t("common.na")) : t("status.disabled")}</td>
                  <td className="truncate whitespace-nowrap px-3 py-3 text-center tabular-nums">{server.enabled ? formatLocalDateTime(server.last_checked_at) : t("status.disabled")}</td>
                  <td className="sticky right-0 bg-white px-3 py-3 dark:bg-slate-900">
                    <div className="flex justify-end gap-1.5">
                      <button
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                        onClick={() => void refreshServer(server)}
                        disabled={refreshDisabled || busyServerId === server.id || !server.enabled}
                        title={t("servers.refreshNow")}
                      >
                        <RefreshCw className={`h-4 w-4 ${busyServerId === server.id ? "animate-spin" : ""}`} />
                      </button>
                      <button
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                        onClick={() => openServerForm("details", server)}
                        disabled={busyServerId === server.id}
                        title={t("dashboard.configure")}
                      >
                        <Settings className="h-4 w-4" />
                      </button>
                      <button
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                        onClick={() => openServerForm("edit", server)}
                        disabled={busyServerId === server.id}
                        title={t("common.edit")}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                        onClick={() => deleteServer(server)}
                        disabled={busyServerId === server.id}
                        title={t("common.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formMode === "edit" && selectedServer && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-6">
          <div className="w-full max-w-5xl">
            <ServerForm
              server={selectedServer}
              title={
                t("servers.editServerWithHostname", { hostname: selectedServer.hostname })
              }
              onCancel={closeServerForm}
              onSubmit={saveServer}
              saving={busyServerId === selectedServer.id}
              actionMessage={formActionMessage}
              onTestSsh={async (payload) => {
                setActionError(null);
                setFormActionMessage(null);
                try {
                  const saved = await saveSelectedForAction(payload);
                  if (saved) {
                    const result = await api.testSsh(saved.id);
                    if (result.success) {
                      setFormActionMessage({ type: "success", text: t("servers.sshTestPassed") });
                    } else {
                      setFormActionMessage({
                        type: "error",
                        text: result.error_message ? t(`sshErrors.${result.error_message}`, { defaultValue: result.error_message }) : t("errors.testSsh"),
                      });
                    }
                  }
                  await reload();
                } catch (error) {
                  setFormActionMessage({ type: "error", text: actionFailureMessage("errors.testSsh", error, "sshErrors") });
                } finally {
                  setBusyServerId(null);
                }
              }}
              onTestWhm={async (payload) => {
                setActionError(null);
                setFormActionMessage(null);
                try {
                  const saved = await saveSelectedForAction(payload);
                  if (saved) {
                    const result = await api.testWhm(saved.id);
                    if (result.success) {
                      setFormActionMessage({ type: "success", text: t("servers.whmTestPassed") });
                    } else {
                      setFormActionMessage({
                        type: "error",
                        text: result.error_message ? t(`whmErrors.${result.error_message}`, { defaultValue: result.error_message }) : t("errors.testWhm"),
                      });
                    }
                  }
                  await reload();
                } catch (error) {
                  setFormActionMessage({ type: "error", text: actionFailureMessage("errors.testWhm", error, "whmErrors") });
                } finally {
                  setBusyServerId(null);
                }
              }}
              onRefresh={async (payload) => {
                setActionError(null);
                setFormActionMessage(null);
                try {
                  const saved = await saveSelectedForAction(payload);
                  if (saved) await api.refreshServer(saved.id);
                  setFormActionMessage({ type: "success", text: t("servers.refreshPassed") });
                  await reload();
                  await loadMetrics();
                } catch (error) {
                  setFormActionMessage({ type: "error", text: actionFailureMessage("errors.refreshMetrics", error, "sshErrors") });
                } finally {
                  setBusyServerId(null);
                }
              }}
              actionBusy={busyServerId === selectedServer.id}
            />
          </div>
        </div>
      )}
      {formMode === "details" && selectedServer && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-6">
          <div className="w-full max-w-6xl">
            <ServerDetails server={selectedServer} onClose={closeServerForm} onChanged={reload} />
          </div>
        </div>
      )}
      {dialog}
    </div>
  );
}

function formatPercent(value: number | null | undefined, fallback: string) {
  return value === undefined || value === null ? fallback : `${value.toFixed(1)}%`;
}

function formatCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
