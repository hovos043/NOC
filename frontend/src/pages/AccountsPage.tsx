import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, RefreshCw, Save, Trash2 } from "lucide-react";
import { ApiError, api } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { StatusBadge } from "../components/StatusBadge";
import { useConfirmDialog } from "../components/ConfirmDialog";
import type { Account, AccountListResponse, AccountNote } from "../types";
import { formatLocalDate, formatLocalDateTime } from "../utils/date";

type SortDir = "asc" | "desc";
type AccountStatusFilter = "all" | "active" | "suspended";

const emptyResponse: AccountListResponse = {
  items: [],
  total: 0,
  page: 1,
  page_size: 50,
  total_accounts: 0,
  active_accounts: 0,
  suspended_accounts: 0,
  servers_count: 0,
  servers: [],
  packages: [],
  server_overview: null,
};

export function AccountsPage({
  reloadServers,
  selectedServerId,
  onServerFilterApplied,
}: {
  reloadServers: () => Promise<void>;
  selectedServerId?: number | null;
  onServerFilterApplied?: () => void;
}) {
  const { t } = useTranslation();
  const [response, setResponse] = useState<AccountListResponse>(emptyResponse);
  const [selected, setSelected] = useState<Account | null>(null);
  const [serverId, setServerId] = useState<number | "">("");
  const [packageName, setPackageName] = useState("");
  const [status, setStatus] = useState<AccountStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("domain");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirmDialog();

  const totalPages = useMemo(() => Math.max(1, Math.ceil(response.total / pageSize)), [pageSize, response.total]);

  useEffect(() => {
    if (selectedServerId) {
      setServerId(selectedServerId);
      setPage(1);
      onServerFilterApplied?.();
    }
  }, [onServerFilterApplied, selectedServerId]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadAccounts();
    }, 180);
    return () => window.clearTimeout(handle);
  }, [serverId, packageName, status, search, sortBy, sortDir, page, pageSize]);

  const loadAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listAccounts({
        search,
        server_id: serverId,
        package: packageName,
        status,
        sort_by: sortBy,
        sort_dir: sortDir,
        page,
        page_size: pageSize,
      });
      setResponse(data);
    } catch {
      setError(t("errors.loadAccounts"));
    } finally {
      setLoading(false);
    }
  };

  const resetPage = () => setPage(1);

  const syncAccounts = async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await api.syncAccounts();
      if (!result.success) {
        setError(formatSyncError(result, t));
      }
      await loadAccounts();
      await reloadServers();
    } catch (error) {
      if (error instanceof ApiError) {
        setError(`${t("errors.syncAccounts")} (${error.status}: ${error.detail})`);
      } else {
        setError(t("errors.syncAccounts"));
      }
    } finally {
      setSyncing(false);
    }
  };

  const sort = (column: string) => {
    resetPage();
    if (sortBy === column) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("asc");
    }
  };

  const suspend = async (account: Account) => {
    const confirmed = await confirm({
      title: t("confirm.suspendAccountTitle"),
      message: t("accounts.confirmSuspend", { domain: account.domain }),
      warning: t("confirm.suspendAccountWarning"),
      confirmLabel: t("accounts.suspend"),
    });
    if (!confirmed) return;
    setError(null);
    try {
      await api.suspendAccount(account.id);
      await loadAccounts();
      setSelected(await api.getAccount(account.id));
    } catch {
      setError(t("errors.suspendAccount"));
    }
  };

  const unsuspend = async (account: Account) => {
    const confirmed = await confirm({
      title: t("confirm.unsuspendAccountTitle"),
      message: t("accounts.confirmUnsuspend", { domain: account.domain }),
      warning: t("confirm.unsuspendAccountWarning"),
      confirmLabel: t("accounts.unsuspend"),
      variant: "primary",
    });
    if (!confirmed) return;
    setError(null);
    try {
      await api.unsuspendAccount(account.id);
      await loadAccounts();
      setSelected(await api.getAccount(account.id));
    } catch {
      setError(t("errors.unsuspendAccount"));
    }
  };

  const emptyTitle = status === "suspended" ? t("accounts.noSuspendedTitle") : t("accounts.emptyTitle");
  const emptyDescription = response.total_accounts > 0 ? t("accounts.noFilterMatch") : t("accounts.emptyDescription");

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} />}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label={t("accounts.totalAccounts")} value={response.total_accounts} />
        <SummaryCard label={t("accounts.activeAccounts")} value={response.active_accounts} />
        <SummaryCard label={t("accounts.suspendedAccounts")} value={response.suspended_accounts} />
        <SummaryCard label={t("accounts.servers")} value={response.servers_count} />
      </div>

      {response.server_overview && (
        <div className="panel-surface p-4">
          <h2 className="text-base font-semibold">{response.server_overview.server_name}</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
            <Info label={t("accounts.server")} value={response.server_overview.server_name} />
            <Info label={t("accounts.accountsCount")} value={String(response.server_overview.accounts_count)} />
            <Info label={t("accounts.activeAccounts")} value={String(response.server_overview.active_accounts)} />
            <Info label={t("accounts.suspendedAccounts")} value={String(response.server_overview.suspended_accounts)} />
            <Info label={t("accounts.lastSync")} value={formatLocalDateTime(response.server_overview.last_sync_time)} />
          </dl>
        </div>
      )}

      <div className="panel-surface p-3">
        <div className="grid gap-2 md:grid-cols-5">
          <Select
            label={t("accounts.serverFilter")}
            value={String(serverId)}
            onChange={(value) => {
              setServerId(value ? Number(value) : "");
              resetPage();
            }}
            options={[{ label: t("accounts.allServers"), value: "" }, ...response.servers.map((server) => ({ label: server.hostname, value: String(server.id) }))]}
          />
          <Select
            label={t("accounts.packageFilter")}
            value={packageName}
            onChange={(value) => {
              setPackageName(value);
              resetPage();
            }}
            options={[{ label: t("accounts.allPackages"), value: "" }, ...response.packages.map((pkg) => ({ label: pkg, value: pkg }))]}
          />
          <Select
            label={t("accounts.statusFilter")}
            value={status}
            onChange={(value) => {
              setStatus(value as AccountStatusFilter);
              resetPage();
            }}
            options={[
              { label: t("accounts.allStatuses"), value: "all" },
              { label: t("accounts.activeStatus"), value: "active" },
              { label: t("accounts.suspendedStatus"), value: "suspended" },
            ]}
          />
          <label className="block md:col-span-1">
            <span className="field-label">{t("common.search")}</span>
            <input
              className="input mt-1"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetPage();
              }}
              placeholder={t("accounts.searchPlaceholder")}
            />
          </label>
          <div className="flex items-end">
            <button className="btn btn-primary w-full" onClick={syncAccounts} disabled={syncing}>
              <RefreshCw className="h-4 w-4" />
              {syncing ? t("accounts.syncing") : t("accounts.sync")}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">{t("common.loading")}</div>
      ) : response.items.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="overflow-x-auto panel-surface">
          <table className="w-full min-w-[920px] table-fixed border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <Sortable label={t("accounts.domain")} column="domain" sortBy={sortBy} sortDir={sortDir} onSort={sort} width="w-56" />
                <Sortable label={t("accounts.username")} column="username" sortBy={sortBy} sortDir={sortDir} onSort={sort} width="w-32" />
                <th className="w-40 px-3 py-3">{t("accounts.server")}</th>
                <Sortable label={t("accounts.package")} column="package" sortBy={sortBy} sortDir={sortDir} onSort={sort} width="w-32" />
                <Sortable label={t("accounts.ip")} column="ip_address" sortBy={sortBy} sortDir={sortDir} onSort={sort} width="w-32" />
                <th className="w-28 px-3 py-3 text-center">{t("accounts.diskUsage")}</th>
                <Sortable label={t("accounts.status")} column="suspended" sortBy={sortBy} sortDir={sortDir} onSort={sort} width="w-28" />
                <Sortable label={t("accounts.created")} column="created_at" sortBy={sortBy} sortDir={sortDir} onSort={sort} width="w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {response.items.map((account) => (
                <tr key={account.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-950" onClick={() => setSelected(account)}>
                  <td className="truncate px-3 py-3 font-medium" title={account.domain}>{account.domain}</td>
                  <td className="truncate px-3 py-3">{account.username}</td>
                  <td className="truncate px-3 py-3">{account.server_hostname}</td>
                  <td className="truncate px-3 py-3">{account.package || "-"}</td>
                  <td className="truncate px-3 py-3 tabular-nums">{account.ip_address || "-"}</td>
                  <td className="truncate px-3 py-3 text-center tabular-nums">{account.disk_usage || "-"}</td>
                  <td className="px-3 py-3 text-center"><StatusBadge type={account.suspended ? "suspended" : "active"} /></td>
                  <td className="truncate px-3 py-3 text-center tabular-nums">{formatLocalDate(account.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-slate-500">{t("accounts.rowsPerPage")}</span>
          <select
            className="input h-9 w-24"
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
          >
            {[25, 50, 100, 250].map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        <span>{t("accounts.pageInfo", { page, totalPages })}</span>
        <button className="btn btn-secondary" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
          {t("common.previous")}
        </button>
        <button className="btn btn-secondary" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>
          {t("common.next")}
        </button>
      </div>

      {selected && <AccountDetails account={selected} onClose={() => setSelected(null)} onSuspend={suspend} onUnsuspend={unsuspend} />}
      {dialog}
    </div>
  );
}

function AccountDetails({
  account,
  onClose,
  onSuspend,
  onUnsuspend,
}: {
  account: Account;
  onClose: () => void;
  onSuspend: (account: Account) => Promise<void>;
  onUnsuspend: (account: Account) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<AccountNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [notesBusy, setNotesBusy] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirmDialog();
  const whmHost = account.server_whm_hostname || account.server_hostname;
  const whmUrl = `https://${whmHost}:${account.server_whm_port}/`;
  const cpanelUrl = `https://${account.domain}:2083/`;

  const noteErrorMessage = (fallbackKey: string, error: unknown) => {
    if (error instanceof ApiError) {
      if (error.status === 404) return t("errors.accountNotesBackendOutdated");
      return `${t(fallbackKey)} (${error.status}: ${error.detail})`;
    }
    return t(fallbackKey);
  };

  useEffect(() => {
    void loadNotes();
  }, [account.id]);

  const loadNotes = async () => {
    setNotesError(null);
    try {
      setNotes(await api.listAccountNotes(account.id));
    } catch (error) {
      setNotesError(noteErrorMessage("errors.loadAccountNotes", error));
    }
  };

  const saveNote = async () => {
    const trimmed = noteText.trim();
    if (!trimmed) return;
    setNotesBusy(true);
    setNotesError(null);
    try {
      await api.createAccountNote(account.id, { note: trimmed });
      setNoteText("");
      await loadNotes();
    } catch (error) {
      setNotesError(noteErrorMessage("errors.saveAccountNote", error));
    } finally {
      setNotesBusy(false);
    }
  };

  const clearNotes = async () => {
    const confirmed = await confirm({
      title: t("confirm.clearNotesTitle"),
      message: t("accounts.confirmClearNotes", { domain: account.domain }),
      warning: t("confirm.clearNotesWarning"),
      confirmLabel: t("accounts.clearNotes"),
    });
    if (!confirmed) return;
    setNotesBusy(true);
    setNotesError(null);
    try {
      await api.clearAccountNotes(account.id);
      setNotes([]);
    } catch (error) {
      setNotesError(noteErrorMessage("errors.clearAccountNotes", error));
    } finally {
      setNotesBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-6">
      <div className="w-full max-w-4xl panel-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{account.domain}</h2>
            <p className="mt-1 truncate text-sm text-slate-500">{account.username}</p>
          </div>
          <button className="btn btn-secondary" onClick={onClose}>{t("common.close")}</button>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <Section title={t("accounts.general")} rows={[
            [t("accounts.domain"), account.domain],
            [t("accounts.username"), account.username],
            [t("accounts.owner"), account.owner || "-"],
            [t("accounts.package"), account.package || "-"],
            [t("accounts.server"), account.server_hostname],
            [t("accounts.creationDate"), formatLocalDate(account.created_at)],
          ]} />
          <Section title={t("accounts.resources")} rows={[
            [t("accounts.diskUsage"), account.disk_usage || "-"],
            [t("accounts.diskLimit"), account.disk_limit || "-"],
            [t("accounts.bandwidthUsage"), account.bandwidth_usage || "-"],
            [t("accounts.bandwidthLimit"), account.bandwidth_limit || "-"],
          ]} />
          <Section title={t("accounts.status")} rows={[
            [t("accounts.status"), account.suspended ? t("accounts.suspendedStatus") : t("accounts.activeStatus")],
            [t("accounts.suspensionReason"), account.suspension_reason || "-"],
          ]} />
        </div>

        <section className="mt-5 rounded-md border border-slate-200 p-4 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t("accounts.notes")}</h3>
            <button className="btn btn-secondary" onClick={clearNotes} disabled={notesBusy || notes.length === 0}>
              <Trash2 className="h-4 w-4" />
              {t("accounts.clearNotes")}
            </button>
          </div>
          {notesError && <div className="mt-3"><ErrorBanner message={notesError} /></div>}
          <div className="mt-3 flex gap-2">
            <textarea
              className="input min-h-20 flex-1"
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder={t("accounts.notePlaceholder")}
              disabled={notesBusy}
            />
            <button className="btn btn-primary self-start" onClick={saveNote} disabled={notesBusy || !noteText.trim()}>
              <Save className="h-4 w-4" />
              {t("accounts.addNote")}
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {notes.length === 0 ? (
              <p className="text-sm text-slate-500">{t("accounts.noNotes")}</p>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-slate-950">
                  <div className="whitespace-pre-wrap text-slate-800 dark:text-slate-100">{note.note}</div>
                  <div className="mt-1 text-xs text-slate-500">{formatLocalDateTime(note.created_at)}</div>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button className="btn btn-secondary" onClick={() => window.open(whmUrl, "_blank", "noopener,noreferrer")}>
            <ExternalLink className="h-4 w-4" />
            {t("accounts.openWhm")}
          </button>
          <button className="btn btn-secondary" onClick={() => window.open(cpanelUrl, "_blank", "noopener,noreferrer")}>
            <ExternalLink className="h-4 w-4" />
            {t("accounts.openCpanel")}
          </button>
          {account.suspended ? (
            <button className="btn btn-primary" onClick={() => onUnsuspend(account)}>{t("accounts.unsuspend")}</button>
          ) : (
            <button className="btn btn-danger" onClick={() => onSuspend(account)}>{t("accounts.suspend")}</button>
          )}
        </div>
        {dialog}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: { label: string; value: string }[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <select className="input mt-1" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
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

function Section({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <section>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <dl className="mt-3 space-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="field-label">{label}</dt>
            <dd className="mt-1 truncate text-slate-800 dark:text-slate-100" title={value}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Sortable({
  label,
  column,
  sortBy,
  sortDir,
  onSort,
  width,
}: {
  label: string;
  column: string;
  sortBy: string;
  sortDir: SortDir;
  onSort: (column: string) => void;
  width: string;
}) {
  return (
    <th className={`${width} px-3 py-3`}>
      <button className="inline-flex max-w-full items-center gap-1 truncate" onClick={() => onSort(column)}>
        <span className="truncate">{label}</span>
        {sortBy === column ? (sortDir === "asc" ? "↑" : "↓") : ""}
      </button>
    </th>
  );
}

function formatSyncError(result: { error_message: string | null; errors?: { server: string; error: string }[] }, t: (key: string, options?: Record<string, unknown>) => string) {
  const serverErrors = result.errors ?? [];
  if (serverErrors.length === 0) {
    return result.error_message ? t(`whmErrors.${result.error_message}`, { defaultValue: result.error_message }) : t("errors.syncAccounts");
  }
  return `${t("errors.syncAccounts")} ${serverErrors
    .map((item) => `${item.server}: ${t(`whmErrors.${item.error}`, { defaultValue: item.error })}`)
    .join(" | ")}`;
}
