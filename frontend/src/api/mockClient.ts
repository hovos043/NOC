import type {
  Account,
  AccountListResponse,
  AccountNote,
  AccountSearchResult,
  AppSettings,
  AuditLog,
  CommandExecuteResult,
  CommandHistoryItem,
  CommandSafetyResult,
  ConnectionHistory,
  Diagnostics,
  MonitoringSnapshot,
  SavedCommand,
  Server,
  SshActionResult,
  TerminalConnectResult,
  WhmActionResult,
} from "../types";

const now = new Date().toISOString();

const servers: Server[] = [
  server(1, "host19.name.am", "89.117.52.227", 713, 20, "3d 4h", "4.56 / 4.53 / 4.35", 10),
  server(6, "host26", "213.136.75.166", 687, 10, "3d 4h", "3.43 / 3.08 / 2.86", 1.1),
  server(3, "host27", "91.134.22.237", 508, 27, "2d 3h", "10.15 / 9.75 / 9.71", 11.9),
  server(4, "host28", "161.97.154.98", 474, 6, "3d 0h", "6.18 / 5.80 / 5.43", 11.8),
  server(5, "host30", "51.38.26.56", 986, 20, "3d 0h", "9.26 / 7.95 / 7.65", 5.6),
];

const metrics = new Map<number, MonitoringSnapshot>(
  servers.map((item, index) => [
    item.id,
    {
      id: item.id,
      server_id: item.id,
      hostname: item.hostname,
      os_name: "AlmaLinux",
      os_version: "9",
      kernel: "5.14.0",
      uptime: null,
      uptime_text: ["3d 4h", "3d 4h", "2d 3h", "3d 0h", "3d 0h"][index],
      cpu_model: "Intel Xeon",
      cpu_cores: 8,
      cpu_usage: [10, 1.1, 11.9, 11.8, 5.6][index],
      load_average: ["4.56 / 4.53 / 4.35", "3.43 / 3.08 / 2.86", "10.15 / 9.75 / 9.71", "6.18 / 5.80 / 5.43", "9.26 / 7.95 / 7.65"][index],
      load_average_1: null,
      load_average_5: null,
      load_average_15: null,
      ram_total: 0,
      ram_used: 0,
      ram_free: 0,
      ram_usage: [9.2, 28.9, 61.2, 17.7, 57][index],
      swap_total: 0,
      swap_used: 0,
      swap_free: 0,
      swap_usage: [0, 0, 72.4, 0, 25.6][index],
      disk_highest_usage: [56, 82, 88, 77, 83][index],
      disks: [],
      collected_at: now,
    },
  ]),
);

const accounts: Account[] = servers.flatMap((item, serverIndex) =>
  Array.from({ length: 24 }, (_, index) => ({
    id: item.id * 1000 + index,
    server_id: item.id,
    server_hostname: item.hostname,
    server_display_name: item.display_name,
    server_whm_hostname: item.whm_hostname,
    server_whm_port: item.whm_port,
    domain: `demo-${serverIndex + 1}-${index + 1}.am`,
    username: `user${serverIndex + 1}${String(index + 1).padStart(2, "0")}`,
    owner: "root",
    package: ["Business", "Premium", "Hosting40", "Hosting80"][index % 4],
    ip_address: item.ip_address,
    disk_usage: `${(index + 1) * 120}M`,
    disk_limit: index % 3 === 0 ? "Unlimited" : "10G",
    bandwidth_usage: `${index + 1}G`,
    bandwidth_limit: "Unlimited",
    suspended: index % 11 === 0,
    suspension_reason: index % 11 === 0 ? "Demo suspended account" : null,
    created_at: now,
    updated_at: now,
  })),
);

const savedCommands: SavedCommand[] = [
  { id: 1, title: "Check load", command: "uptime && top -bn1 | head", category: "System", created_at: now, updated_at: now },
  { id: 2, title: "Disk usage", command: "df -h", category: "Disk", created_at: now, updated_at: now },
];

export async function mockRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  const method = (options.method || "GET").toUpperCase();
  if (path === "/servers") return clone(servers) as T;
  if (path === "/settings") return clone({ language: "en", theme: "dark", default_monitoring_interval_minutes: 3 } satisfies AppSettings) as T;
  if (path === "/accounts/sync") return whmResult(3368) as T;
  if (path.startsWith("/accounts/search")) return clone(accounts.slice(0, 10).map(toSearchResult)) as T;
  if (path.startsWith("/accounts?")) return clone(listAccounts(path)) as T;
  if (path.match(/^\/accounts\/\d+$/)) return clone(accounts.find((item) => item.id === Number(path.split("/")[2])) || accounts[0]) as T;
  if (path.match(/^\/accounts\/\d+\/notes$/)) return (method === "GET" ? clone(notes(Number(path.split("/")[2]))) : method === "POST" ? clone(notes(Number(path.split("/")[2]))[0]) : undefined) as T;
  if (path === "/audit-logs") return clone(auditLogs()) as T;
  if (path === "/diagnostics") return clone(diagnostics()) as T;
  if (path === "/saved-commands") return clone(savedCommands) as T;
  if (path.match(/^\/servers\/\d+\/metrics\/latest$/)) return clone(metrics.get(Number(path.split("/")[2])) || null) as T;
  if (path.match(/^\/servers\/\d+\/connection-history$/)) return clone([{ id: 1, server_id: Number(path.split("/")[2]), success: true, message: "Demo connection OK", error_message: null, created_at: now }] satisfies ConnectionHistory[]) as T;
  if (path.match(/^\/servers\/\d+\/terminal\/history$/)) return clone(commandHistory(Number(path.split("/")[2]))) as T;
  if (path.match(/^\/servers\/\d+\/terminal\/prepare$/)) return clone({ command: "", is_dangerous: false, is_blocked: false, reason: null, confirmation_text: "I understand" } satisfies CommandSafetyResult) as T;
  if (path.match(/^\/servers\/\d+\/terminal\/execute$/)) return clone(commandResult(options)) as T;
  if (path.match(/^\/servers\/\d+\/terminal\/connect$/)) return clone({ success: true, status: "connected", error_message: null } satisfies TerminalConnectResult) as T;
  if (path.match(/^\/servers\/\d+\/terminal\/disconnect$/)) return clone({ success: true, status: "disconnected", error_message: null } satisfies TerminalConnectResult) as T;
  if (path === "/servers/refresh-enabled" || path.match(/^\/servers\/\d+\/refresh$/) || path.match(/^\/servers\/\d+\/test-ssh$/)) return clone([{ success: true, status: "connected", message: "demo", error_message: null, snapshot: null }] satisfies SshActionResult[]) as T;
  if (path.match(/^\/servers\/\d+\/test-whm$/) || path.match(/^\/servers\/\d+\/sync-accounts$/)) return whmResult(100) as T;
  return undefined as T;
}

function server(id: number, displayName: string, ip: string, accountCount: number, suspendedCount: number, uptime: string, load: string, cpu: number): Server {
  return {
    id,
    display_name: displayName,
    hostname: displayName.includes(".") ? displayName : `${displayName}.name.am`,
    ip_address: ip,
    provider: id % 2 ? "OVH" : "Contabo",
    ssh_port: 22,
    ssh_username: "root",
    ssh_key_path: "",
    ssh_auth_method: "key",
    ssh_private_key_path: "",
    ssh_key_type: "RSA",
    ssh_status: "connected",
    last_ssh_test_at: now,
    last_ssh_error: null,
    last_checked_at: now,
    whm_hostname: displayName.includes(".") ? displayName : `${displayName}.name.am`,
    whm_port: 2087,
    whm_username: "root",
    whm_status: "connected",
    last_whm_test_at: now,
    last_whm_error: null,
    last_account_sync_at: now,
    accounts_count: accountCount,
    suspended_accounts_count: suspendedCount,
    notes: "",
    enabled: true,
    has_whm_api_token: true,
    has_ssh_password: false,
    has_ssh_private_key: true,
    has_ssh_key_passphrase: false,
    created_at: now,
    updated_at: now,
  };
}

function listAccounts(path: string): AccountListResponse {
  const params = new URLSearchParams(path.split("?")[1]);
  const serverId = params.get("server_id");
  const query = (params.get("search") || "").toLowerCase();
  const packageName = params.get("package") || "";
  const status = params.get("status") || "all";
  const page = Number(params.get("page") || 1);
  const pageSize = Number(params.get("page_size") || 50);
  let filtered = accounts;
  if (serverId) filtered = filtered.filter((item) => item.server_id === Number(serverId));
  if (packageName) filtered = filtered.filter((item) => item.package === packageName);
  if (status === "active") filtered = filtered.filter((item) => !item.suspended);
  if (status === "suspended") filtered = filtered.filter((item) => item.suspended);
  if (query) filtered = filtered.filter((item) => [item.domain, item.username, item.owner, item.ip_address, item.package].some((value) => value?.toLowerCase().includes(query)));
  const offset = (page - 1) * pageSize;
  return {
    items: filtered.slice(offset, offset + pageSize),
    total: filtered.length,
    page,
    page_size: pageSize,
    total_accounts: accounts.length,
    active_accounts: accounts.filter((item) => !item.suspended).length,
    suspended_accounts: accounts.filter((item) => item.suspended).length,
    servers_count: servers.length,
    servers: servers.map((item) => ({ id: item.id, hostname: item.hostname })),
    packages: Array.from(new Set(accounts.map((item) => item.package).filter(Boolean))) as string[],
    server_overview: serverId
      ? {
          server_id: Number(serverId),
          server_name: servers.find((item) => item.id === Number(serverId))?.hostname || "unknown",
          accounts_count: filtered.length,
          active_accounts: filtered.filter((item) => !item.suspended).length,
          suspended_accounts: filtered.filter((item) => item.suspended).length,
          last_sync_time: now,
        }
      : null,
  };
}

function notes(accountId: number): AccountNote[] {
  return [{ id: accountId, account_id: accountId, note: "Demo note: checked DNS and WHM account status.", created_at: now }];
}

function toSearchResult(account: Account): AccountSearchResult {
  return { id: account.id, server: account.server_hostname, username: account.username, domain: account.domain, package: account.package, status: account.suspended ? "suspended" : "active" };
}

function commandHistory(serverId: number): CommandHistoryItem[] {
  return [{ id: serverId, server_id: serverId, command: "uptime", exit_code: 0, status: "success", stdout_preview: "Demo output", stderr_preview: null, duration_ms: 120, created_at: now }];
}

function commandResult(options: RequestInit): CommandExecuteResult {
  const payload = JSON.parse(String(options.body || "{}")) as { command?: string };
  return {
    command: payload.command || "demo",
    stdout: "Demo mode: command execution is disabled in static preview.",
    stderr: "",
    exit_code: 0,
    status: "success",
    duration_ms: 120,
    is_dangerous: false,
    was_confirmed: false,
    stdout_truncated: false,
    stderr_truncated: false,
  };
}

function auditLogs(): AuditLog[] {
  return servers.map((item) => ({ id: item.id, server_id: item.id, hostname: item.hostname, username: "root", action_type: "demo", command: "uptime", is_dangerous: false, was_confirmed: false, status: "success", exit_code: 0, stdout_preview: "Demo output", stderr_preview: null, duration_ms: 120, created_at: now }));
}

function diagnostics(): Diagnostics {
  return {
    status: "ok",
    app_name: "Name.am NOC Dashboard Web Preview",
    backend_pid: 0,
    backend_host: "demo",
    backend_port: 0,
    database_path: "demo mode",
    schema_version: "web-preview",
    servers_count: servers.length,
    enabled_servers_count: servers.length,
    accounts_count: accounts.length,
    audit_logs_count: servers.length,
    command_history_count: servers.length,
    latest_backup: "demo mode",
    servers: servers.map((item) => ({ id: item.id, display_name: item.display_name, hostname: item.hostname, enabled: item.enabled, ssh_status: item.ssh_status, whm_status: item.whm_status, last_whm_error: item.last_whm_error, last_account_sync_at: item.last_account_sync_at })),
  };
}

function whmResult(syncedCount: number): WhmActionResult {
  return { success: true, status: "connected", message: "accounts_synced", error_message: null, synced_count: syncedCount, errors: [] };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
