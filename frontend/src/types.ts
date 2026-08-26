export type Server = {
  id: number;
  display_name: string;
  hostname: string;
  ip_address: string | null;
  provider: string | null;
  ssh_port: number;
  ssh_username: string | null;
  ssh_key_path: string | null;
  ssh_auth_method: "password" | "key";
  ssh_private_key_path: string | null;
  ssh_key_type: string | null;
  ssh_status: SshStatus;
  last_ssh_test_at: string | null;
  last_ssh_error: string | null;
  last_checked_at: string | null;
  whm_hostname: string | null;
  whm_port: number;
  whm_username: string | null;
  whm_status: WhmStatus;
  last_whm_test_at: string | null;
  last_whm_error: string | null;
  last_account_sync_at: string | null;
  accounts_count: number;
  suspended_accounts_count: number;
  notes: string | null;
  enabled: boolean;
  has_whm_api_token: boolean;
  has_ssh_password: boolean;
  has_ssh_private_key: boolean;
  has_ssh_key_passphrase: boolean;
  created_at: string;
  updated_at: string;
};

export type SshStatus = "never_tested" | "connected" | "failed" | "disabled" | "not_configured";
export type WhmStatus = "never_tested" | "connected" | "failed" | "disabled" | "not_configured";

export type ServerPayload = Omit<
  Server,
  "id" | "has_whm_api_token" | "has_ssh_password" | "has_ssh_private_key" | "has_ssh_key_passphrase" | "ssh_status" | "last_ssh_test_at" | "last_ssh_error" | "last_checked_at" | "created_at" | "updated_at"
  | "whm_status" | "last_whm_test_at" | "last_whm_error" | "last_account_sync_at" | "accounts_count" | "suspended_accounts_count"
> & {
  ssh_password?: string | null;
  ssh_private_key?: string | null;
  ssh_key_passphrase?: string | null;
  whm_api_token?: string | null;
};

export type DiskUsage = {
  filesystem: string;
  size: string;
  used: string;
  available: string;
  usage_percent: number | null;
  mount_point: string;
};

export type MonitoringSnapshot = {
  id: number;
  server_id: number;
  hostname: string | null;
  os_name: string | null;
  os_version: string | null;
  kernel: string | null;
  uptime: string | null;
  uptime_text: string | null;
  cpu_model: string | null;
  cpu_cores: number | null;
  cpu_usage: number | null;
  load_average: string | null;
  load_average_1: number | null;
  load_average_5: number | null;
  load_average_15: number | null;
  ram_total: number | null;
  ram_used: number | null;
  ram_free: number | null;
  ram_usage: number | null;
  swap_total: number | null;
  swap_used: number | null;
  swap_free: number | null;
  swap_usage: number | null;
  disk_highest_usage: number | null;
  disks: DiskUsage[];
  collected_at: string;
};

export type ConnectionHistory = {
  id: number;
  server_id: number;
  success: boolean;
  message: string | null;
  error_message: string | null;
  created_at: string;
};

export type SshActionResult = {
  success: boolean;
  status: SshStatus;
  message: string | null;
  error_message: string | null;
  snapshot: MonitoringSnapshot | null;
};

export type WhmActionResult = {
  success: boolean;
  status: WhmStatus | "failed";
  message: string | null;
  error_message: string | null;
  synced_count: number | null;
  errors: WhmSyncError[];
};

export type WhmSyncError = {
  server: string;
  error: string;
};

export type Account = {
  id: number;
  server_id: number;
  server_hostname: string;
  server_display_name: string;
  server_whm_hostname: string | null;
  server_whm_port: number;
  domain: string;
  username: string;
  owner: string | null;
  package: string | null;
  ip_address: string | null;
  disk_usage: string | null;
  disk_limit: string | null;
  bandwidth_usage: string | null;
  bandwidth_limit: string | null;
  suspended: boolean;
  suspension_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountNote = {
  id: number;
  account_id: number;
  note: string;
  created_at: string;
};

export type AccountNotePayload = {
  note: string;
};

export type AccountListResponse = {
  items: Account[];
  total: number;
  page: number;
  page_size: number;
  total_accounts: number;
  active_accounts: number;
  suspended_accounts: number;
  servers_count: number;
  servers: AccountServerOption[];
  packages: string[];
  server_overview: AccountServerOverview | null;
};

export type AccountServerOption = {
  id: number;
  hostname: string;
};

export type AccountServerOverview = {
  server_id: number;
  server_name: string;
  accounts_count: number;
  active_accounts: number;
  suspended_accounts: number;
  last_sync_time: string | null;
};

export type AccountSearchResult = {
  id: number;
  server: string;
  username: string;
  domain: string;
  package: string | null;
  status: "active" | "suspended";
};

export type AppSettings = {
  language: "en" | "hy" | "ru";
  theme: "dark" | "light";
  default_monitoring_interval_minutes: number;
};

export type TerminalConnectResult = {
  success: boolean;
  status: "disconnected" | "connecting" | "connected" | "error" | "not_configured";
  error_message: string | null;
};

export type CommandSafetyResult = {
  command: string;
  is_dangerous: boolean;
  is_blocked: boolean;
  reason: string | null;
  confirmation_text: string;
};

export type CommandExecuteResult = {
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  status: string;
  duration_ms: number;
  is_dangerous: boolean;
  was_confirmed: boolean;
  stdout_truncated: boolean;
  stderr_truncated: boolean;
};

export type CommandHistoryItem = {
  id: number;
  server_id: number;
  command: string;
  exit_code: number | null;
  status: string;
  stdout_preview: string | null;
  stderr_preview: string | null;
  duration_ms: number | null;
  created_at: string;
};

export type AuditLog = {
  id: number;
  server_id: number | null;
  hostname: string | null;
  username: string | null;
  action_type: string;
  command: string | null;
  is_dangerous: boolean;
  was_confirmed: boolean;
  status: string;
  exit_code: number | null;
  stdout_preview: string | null;
  stderr_preview: string | null;
  duration_ms: number | null;
  created_at: string;
};

export type SavedCommand = {
  id: number;
  title: string;
  command: string;
  category: "System" | "Disk" | "Memory" | "Services" | "Mail" | "Logs" | "Custom";
  created_at: string;
  updated_at: string;
};

export type SavedCommandPayload = Pick<SavedCommand, "title" | "command" | "category">;

export type DiagnosticsServerStatus = {
  id: number;
  display_name: string;
  hostname: string;
  enabled: boolean;
  ssh_status: SshStatus;
  whm_status: WhmStatus;
  last_whm_error: string | null;
  last_account_sync_at: string | null;
};

export type Diagnostics = {
  status: string;
  app_name: string;
  backend_pid: number;
  backend_host: string;
  backend_port: number;
  database_path: string | null;
  schema_version: string;
  servers_count: number;
  enabled_servers_count: number;
  accounts_count: number;
  audit_logs_count: number;
  command_history_count: number;
  latest_backup: string | null;
  servers: DiagnosticsServerStatus[];
};
