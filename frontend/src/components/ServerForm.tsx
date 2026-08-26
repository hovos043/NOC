import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Save, X } from "lucide-react";
import type { Server, ServerPayload } from "../types";

const emptyServer: ServerPayload = {
  display_name: "",
  hostname: "",
  ip_address: "",
  provider: "",
  ssh_port: 22,
  ssh_username: "",
  ssh_key_path: "",
  ssh_auth_method: "password",
  ssh_password: "",
  ssh_private_key: "",
  ssh_private_key_path: "",
  ssh_key_passphrase: "",
  ssh_key_type: "",
  whm_hostname: "",
  whm_port: 2087,
  whm_username: "",
  whm_api_token: "",
  notes: "",
  enabled: false,
};

function fromServer(server?: Server): ServerPayload {
  if (!server) return emptyServer;
  return {
    display_name: server.display_name,
    hostname: server.hostname,
    ip_address: server.ip_address ?? "",
    provider: server.provider ?? "",
    ssh_port: server.ssh_port,
    ssh_username: server.ssh_username ?? "",
    ssh_key_path: server.ssh_key_path ?? "",
    ssh_auth_method: server.ssh_auth_method,
    ssh_password: server.has_ssh_password ? "********" : "",
    ssh_private_key: server.has_ssh_private_key ? "********" : "",
    ssh_private_key_path: server.ssh_private_key_path ?? server.ssh_key_path ?? "",
    ssh_key_passphrase: server.has_ssh_key_passphrase ? "********" : "",
    ssh_key_type: server.ssh_key_type ?? "",
    whm_hostname: server.whm_hostname ?? "",
    whm_port: server.whm_port,
    whm_username: server.whm_username ?? "",
    whm_api_token: server.has_whm_api_token ? "********" : "",
    notes: server.notes ?? "",
    enabled: server.enabled,
  };
}

export function ServerForm({
  server,
  title,
  onCancel,
  onSubmit,
  saving: savingFromParent = false,
  onTestSsh,
  onTestWhm,
  onRefresh,
  actionBusy = false,
  actionMessage,
}: {
  server?: Server;
  title: string;
  onCancel: () => void;
  onSubmit: (payload: ServerPayload) => Promise<void>;
  saving?: boolean;
  onTestSsh?: (payload: ServerPayload) => Promise<void>;
  onTestWhm?: (payload: ServerPayload) => Promise<void>;
  onRefresh?: (payload: ServerPayload) => Promise<void>;
  actionBusy?: boolean;
  actionMessage?: { type: "success" | "error"; text: string } | null;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<ServerPayload>(() => fromServer(server));
  const [savingLocal, setSavingLocal] = useState(false);
  const saving = savingFromParent || savingLocal;

  const setField = <K extends keyof ServerPayload>(key: K, value: ServerPayload[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSavingLocal(true);
    try {
      await onSubmit(form);
    } finally {
      setSavingLocal(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => onTestSsh?.(form)} disabled={!onTestSsh || actionBusy || saving}>
            {t("servers.testSsh")}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onTestWhm?.(form)} disabled={!onTestWhm || actionBusy || saving}>
            {t("servers.testWhm")}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onRefresh?.(form)} disabled={!onRefresh || actionBusy || saving}>
            {t("servers.refreshNow")}
          </button>
        </div>
      </div>
      {actionMessage && (
        <div
          className={`mb-4 rounded-md border px-3 py-2 text-sm ${
            actionMessage.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("fields.displayName")} value={form.display_name} onChange={(value) => setField("display_name", value)} required />
        <Field label={t("fields.hostname")} value={form.hostname} onChange={(value) => setField("hostname", value)} required />
        <Field label={t("fields.ipAddress")} value={form.ip_address ?? ""} onChange={(value) => setField("ip_address", value)} />
        <Field label={t("fields.provider")} value={form.provider ?? ""} onChange={(value) => setField("provider", value)} />
        <label className="block">
          <span className="field-label">{t("fields.sshAuthMethod")}</span>
          <select className="input mt-1" value={form.ssh_auth_method} onChange={(event) => setField("ssh_auth_method", event.target.value as ServerPayload["ssh_auth_method"])}>
            <option value="password">{t("fields.passwordAuth")}</option>
            <option value="key">{t("fields.keyAuth")}</option>
          </select>
        </label>
        <Field type="number" label={t("fields.sshPort")} value={String(form.ssh_port)} onChange={(value) => setField("ssh_port", Number(value))} />
        <Field label={t("fields.sshUsername")} value={form.ssh_username ?? ""} onChange={(value) => setField("ssh_username", value)} />
        {form.ssh_auth_method === "password" ? (
          <Field type="password" label={t("fields.sshPassword")} value={form.ssh_password ?? ""} onChange={(value) => setField("ssh_password", value)} />
        ) : (
          <>
            <TextAreaField label={t("fields.sshPrivateKey")} value={form.ssh_private_key ?? ""} onChange={(value) => setField("ssh_private_key", value)} placeholder={t("fields.sshPrivateKeyPlaceholder")} />
            <Field type="password" label={t("fields.sshKeyPassphrase")} value={form.ssh_key_passphrase ?? ""} onChange={(value) => setField("ssh_key_passphrase", value)} />
            <Field label={t("fields.sshPrivateKeyPath")} value={form.ssh_private_key_path ?? ""} onChange={(value) => setField("ssh_private_key_path", value)} />
            <Field label={t("fields.sshKeyType")} value={form.ssh_key_type ?? ""} onChange={(value) => setField("ssh_key_type", value)} />
          </>
        )}
        <Field label={t("fields.whmHostname")} value={form.whm_hostname ?? ""} onChange={(value) => setField("whm_hostname", value)} />
        <Field type="number" label={t("fields.whmPort")} value={String(form.whm_port)} onChange={(value) => setField("whm_port", Number(value))} />
        <Field label={t("fields.whmUsername")} value={form.whm_username ?? ""} onChange={(value) => setField("whm_username", value)} />
        <Field type="password" label={t("fields.whmApiToken")} value={form.whm_api_token ?? ""} onChange={(value) => setField("whm_api_token", value)} />
      </div>

      <label className="mt-4 block">
        <span className="field-label">{t("fields.notes")}</span>
        <textarea className="input mt-1 min-h-24" value={form.notes ?? ""} onChange={(event) => setField("notes", event.target.value)} />
      </label>

      <label className="mt-4 flex items-center gap-3 text-sm">
        <input className="h-4 w-4 rounded border-slate-300 text-blue-600" type="checkbox" checked={form.enabled} onChange={(event) => setField("enabled", event.target.checked)} />
        {t("fields.enabled")}
      </label>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4" />
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input className="input mt-1" type={type} value={value} required={required} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block md:col-span-2">
      <span className="field-label">{label}</span>
      <textarea className="input mt-1 min-h-36 font-mono text-xs" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
