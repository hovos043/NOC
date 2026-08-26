import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { ApiError, api } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { ServerForm } from "../components/ServerForm";
import { StatusBadge } from "../components/StatusBadge";
import { useConfirmDialog } from "../components/ConfirmDialog";
import type { Server, ServerPayload } from "../types";

type FormMode = "add" | "edit" | null;

export function ServersPage({ servers, reload }: { servers: Server[]; reload: () => Promise<void> }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<FormMode>(null);
  const [selected, setSelected] = useState<Server | undefined>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [formActionMessage, setFormActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [busyServerId, setBusyServerId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

  const closeForm = () => {
    setMode(null);
    setSelected(undefined);
    setActionError(null);
    setFormActionMessage(null);
  };

  const save = async (payload: ServerPayload) => {
    setActionError(null);
    setSaving(true);
    try {
      if (mode === "edit" && selected) {
        await api.updateServer(selected.id, payload);
      } else {
        await api.createServer(payload);
      }
      closeForm();
      await reload();
    } catch {
      setActionError(t("errors.saveServer"));
    } finally {
      setSaving(false);
    }
  };

  const saveSelectedForAction = async (payload: ServerPayload) => {
    if (!selected) return undefined;
    const saved = await api.updateServer(selected.id, payload);
    setSelected(saved);
    return saved;
  };

  const actionFailureMessage = (fallbackKey: string, error: unknown) => {
    if (error instanceof ApiError) {
      return error.detail ? t(`sshErrors.${error.detail}`, { defaultValue: error.detail }) : t(fallbackKey);
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

  const cloneServer = async (server: Server) => {
    setActionError(null);
    setBusyServerId(server.id);
    try {
      await api.cloneServer(server.id);
      await reload();
    } catch {
      setActionError(t("errors.cloneServer"));
    } finally {
      setBusyServerId(null);
    }
  };

  const toggleEnabled = async (server: Server) => {
    setActionError(null);
    setBusyServerId(server.id);
    try {
      await api.setEnabled(server.id, !server.enabled);
      await reload();
    } catch {
      setActionError(t("errors.updateServer"));
    } finally {
      setBusyServerId(null);
    }
  };

  if (mode) {
    return (
      <div className="space-y-4">
        {actionError && <ErrorBanner message={actionError} />}
        <ServerForm
          server={selected}
          title={mode === "edit" ? t("servers.editServer") : t("servers.addServer")}
          onCancel={closeForm}
          onSubmit={save}
          saving={saving}
          actionMessage={formActionMessage}
          onTestSsh={
            selected
              ? async (payload) => {
                  setSaving(true);
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
                    setFormActionMessage({ type: "error", text: actionFailureMessage("errors.testSsh", error) });
                  } finally {
                    setSaving(false);
                  }
                }
              : undefined
          }
          onTestWhm={
            selected
              ? async (payload) => {
                  setSaving(true);
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
                    setFormActionMessage({ type: "error", text: actionFailureMessage("errors.testWhm", error) });
                  } finally {
                    setSaving(false);
                  }
                }
              : undefined
          }
          onRefresh={
            selected
              ? async (payload) => {
                  setSaving(true);
                  setActionError(null);
                  setFormActionMessage(null);
                  try {
                    const saved = await saveSelectedForAction(payload);
                    if (saved) await api.refreshServer(saved.id);
                    setFormActionMessage({ type: "success", text: t("servers.refreshPassed") });
                    await reload();
                  } catch (error) {
                    setFormActionMessage({ type: "error", text: actionFailureMessage("errors.refreshMetrics", error) });
                  } finally {
                    setSaving(false);
                  }
                }
              : undefined
          }
          actionBusy={saving}
        />
        {dialog}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {actionError && <ErrorBanner message={actionError} />}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">{t("servers.description")}</p>
        <button className="btn btn-primary" onClick={() => setMode("add")}>
          <Plus className="h-4 w-4" />
          {t("servers.addServer")}
        </button>
      </div>

      {servers.length === 0 && <EmptyState title={t("servers.emptyTitle")} description={t("servers.emptyDescription")} />}

      <div className="grid gap-4 xl:grid-cols-2">
        {servers.map((server) => (
          <article key={server.id} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">{server.display_name}</h2>
                <p className="mt-1 truncate text-sm text-slate-500">{server.hostname}</p>
              </div>
              <StatusBadge type={server.enabled ? "enabled" : "disabled"} />
            </div>

            <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
              <Info label={t("fields.ipAddress")} value={server.ip_address || "-"} />
              <Info label={t("fields.provider")} value={server.provider || "-"} />
              <Info label={t("fields.sshPort")} value={String(server.ssh_port)} />
              <Info label={t("fields.whmPort")} value={String(server.whm_port)} />
              <Info label={t("fields.whmUsername")} value={server.whm_username || "-"} />
              <Info label={t("fields.whmApiToken")} value={server.has_whm_api_token ? "********" : "-"} />
              <Info label={t("dashboard.whmStatus")} value={t(`status.${server.enabled ? server.whm_status : "disabled"}`)} />
              <Info label={t("fields.sshKeyPath")} value={server.ssh_key_path || "-"} />
            </dl>

            <div className="mt-5 flex flex-wrap gap-2">
              <button className="btn btn-secondary" onClick={() => toggleEnabled(server)} disabled={busyServerId === server.id}>
                <Power className="h-4 w-4" />
                {server.enabled ? t("servers.disable") : t("servers.enable")}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setActionError(null);
                  setSelected(server);
                  setMode("edit");
                }}
                disabled={busyServerId === server.id}
              >
                <Pencil className="h-4 w-4" />
                {t("common.edit")}
              </button>
              <button className="btn btn-secondary" onClick={() => cloneServer(server)} disabled={busyServerId === server.id}>
                <Copy className="h-4 w-4" />
                {t("servers.clone")}
              </button>
              <button className="btn btn-danger" onClick={() => deleteServer(server)} disabled={busyServerId === server.id}>
                <Trash2 className="h-4 w-4" />
                {t("common.delete")}
              </button>
            </div>
          </article>
        ))}
      </div>
      {dialog}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="field-label">{label}</dt>
      <dd className="mt-1 truncate text-slate-700 dark:text-slate-200">{value}</dd>
    </div>
  );
}
