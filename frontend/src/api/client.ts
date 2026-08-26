import type {
  Account,
  AccountListResponse,
  AccountNote,
  AccountNotePayload,
  AccountSearchResult,
  AuditLog,
  AppSettings,
  CommandExecuteResult,
  CommandHistoryItem,
  CommandSafetyResult,
  ConnectionHistory,
  Diagnostics,
  MonitoringSnapshot,
  SavedCommand,
  SavedCommandPayload,
  Server,
  ServerPayload,
  SshActionResult,
  TerminalConnectResult,
  WhmActionResult,
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8765/api";
const STATIC_AUTH_TOKEN = import.meta.env.VITE_NAMEAM_NOC_AUTH_TOKEN;
let authTokenPromise: Promise<string> | null = null;

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "x-nameam-noc-token": token } : {}),
      ...(options.headers ?? {}),
    },
    ...options,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: string };
      detail = body.detail ?? detail;
    } catch {
      detail = response.statusText;
    }
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function getAuthToken(): Promise<string> {
  if (STATIC_AUTH_TOKEN) return STATIC_AUTH_TOKEN;
  if (!authTokenPromise) {
    authTokenPromise = window.nameamNoc?.getAuthToken?.() ?? Promise.resolve("");
  }
  return authTokenPromise;
}

export const api = {
  listServers: () => request<Server[]>("/servers"),
  createServer: (payload: ServerPayload) => request<Server>("/servers", { method: "POST", body: JSON.stringify(payload) }),
  updateServer: (id: number, payload: ServerPayload) => request<Server>(`/servers/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteServer: (id: number) => request<void>(`/servers/${id}`, { method: "DELETE" }),
  cloneServer: (id: number) => request<Server>(`/servers/${id}/clone`, { method: "POST" }),
  setEnabled: (id: number, enabled: boolean) => request<Server>(`/servers/${id}/enabled?enabled=${enabled}`, { method: "PATCH" }),
  testSsh: (id: number) => request<SshActionResult>(`/servers/${id}/test-ssh`, { method: "POST" }),
  testWhm: (id: number) => request<WhmActionResult>(`/servers/${id}/test-whm`, { method: "POST" }),
  refreshServer: (id: number) => request<SshActionResult>(`/servers/${id}/refresh`, { method: "POST" }),
  refreshEnabled: () => request<SshActionResult[]>("/servers/refresh-enabled", { method: "POST" }),
  syncServerAccounts: (id: number) => request<WhmActionResult>(`/servers/${id}/sync-accounts`, { method: "POST" }),
  latestMetrics: (id: number) => request<MonitoringSnapshot | null>(`/servers/${id}/metrics/latest`),
  connectionHistory: (id: number) => request<ConnectionHistory[]>(`/servers/${id}/connection-history`),
  terminalConnect: (id: number) => request<TerminalConnectResult>(`/servers/${id}/terminal/connect`, { method: "POST" }),
  terminalDisconnect: (id: number) => request<TerminalConnectResult>(`/servers/${id}/terminal/disconnect`, { method: "POST" }),
  terminalPrepare: (id: number, command: string) => request<CommandSafetyResult>(`/servers/${id}/terminal/prepare`, { method: "POST", body: JSON.stringify({ command }) }),
  terminalExecute: (id: number, command: string, confirmation_text?: string) =>
    request<CommandExecuteResult>(`/servers/${id}/terminal/execute`, { method: "POST", body: JSON.stringify({ command, confirmation_text }) }),
  terminalHistory: (id: number) => request<CommandHistoryItem[]>(`/servers/${id}/terminal/history`),
  listAccounts: (params: {
    search?: string;
    server_id?: number | "";
    package?: string;
    status?: "all" | "active" | "suspended";
    sort_by?: string;
    sort_dir?: "asc" | "desc";
    page?: number;
    page_size?: number;
  }) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") query.set(key, String(value));
    });
    return request<AccountListResponse>(`/accounts?${query.toString()}`);
  },
  getAccount: (id: number) => request<Account>(`/accounts/${id}`),
  listAccountNotes: (id: number) => request<AccountNote[]>(`/accounts/${id}/notes`),
  createAccountNote: (id: number, payload: AccountNotePayload) => request<AccountNote>(`/accounts/${id}/notes`, { method: "POST", body: JSON.stringify(payload) }),
  clearAccountNotes: (id: number) => request<void>(`/accounts/${id}/notes`, { method: "DELETE" }),
  searchAccounts: (q: string) => request<AccountSearchResult[]>(`/accounts/search?q=${encodeURIComponent(q)}`),
  syncAccounts: () => request<WhmActionResult>("/accounts/sync", { method: "POST" }),
  suspendAccount: (id: number) => request<WhmActionResult>(`/accounts/${id}/suspend`, { method: "POST" }),
  unsuspendAccount: (id: number) => request<WhmActionResult>(`/accounts/${id}/unsuspend`, { method: "POST" }),
  listSavedCommands: () => request<SavedCommand[]>("/saved-commands"),
  createSavedCommand: (payload: SavedCommandPayload) => request<SavedCommand>("/saved-commands", { method: "POST", body: JSON.stringify(payload) }),
  updateSavedCommand: (id: number, payload: SavedCommandPayload) => request<SavedCommand>(`/saved-commands/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteSavedCommand: (id: number) => request<void>(`/saved-commands/${id}`, { method: "DELETE" }),
  listAuditLogs: (serverId?: number) => request<AuditLog[]>(`/audit-logs${serverId ? `?server_id=${serverId}` : ""}`),
  diagnostics: () => request<Diagnostics>("/diagnostics"),
  getSettings: () => request<AppSettings>("/settings"),
  updateSettings: (payload: AppSettings) => request<AppSettings>("/settings", { method: "PUT", body: JSON.stringify(payload) }),
};
