import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sidebar } from "./components/Sidebar";
import { ErrorBanner } from "./components/ErrorBanner";
import { DashboardPage } from "./pages/DashboardPage";
import { ServersPage } from "./pages/ServersPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AccountsPage } from "./pages/AccountsPage";
import { GlobalSearchPage } from "./pages/GlobalSearchPage";
import { CommandRunnerPage } from "./pages/CommandRunnerPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { DiagnosticsPage } from "./pages/DiagnosticsPage";
import { useAppState } from "./store/useAppState";

export type PageKey = "dashboard" | "servers" | "accounts" | "commands" | "search" | "alerts" | "logs" | "diagnostics" | "settings";

export function App() {
  const { t } = useTranslation();
  const [page, setPage] = useState<PageKey>("dashboard");
  const [accountsServerFilter, setAccountsServerFilter] = useState<number | null>(null);
  const state = useAppState();

  const title = useMemo(() => t(`nav.${page}`), [page, t]);

  const content = {
    dashboard: (
      <DashboardPage
        servers={state.servers}
        reload={state.reload}
        monitoringIntervalMinutes={state.settings.default_monitoring_interval_minutes}
        onOpenAccounts={(serverId) => {
          setAccountsServerFilter(serverId);
          setPage("accounts");
        }}
      />
    ),
    servers: <ServersPage servers={state.servers} reload={state.reload} />,
    settings: <SettingsPage settings={state.settings} saveSettings={state.saveSettings} />,
    accounts: <AccountsPage reloadServers={state.reload} selectedServerId={accountsServerFilter} onServerFilterApplied={() => setAccountsServerFilter(null)} />,
    commands: <CommandRunnerPage servers={state.servers} />,
    search: <GlobalSearchPage />,
    alerts: <ComingSoonPage title={t("nav.alerts")} />,
    logs: <AuditLogsPage />,
    diagnostics: <DiagnosticsPage />,
  }[page];

  return (
    <div className="app-shell flex min-h-screen text-slate-900 dark:text-slate-100">
      <Sidebar active={page} onNavigate={setPage} />
      <main className="min-w-0 flex-1">
        <header className="app-header px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">{t("app.subtitle")}</p>
              <h1 className="mt-1 text-2xl font-semibold text-white drop-shadow">{title}</h1>
            </div>
          </div>
        </header>

        <section className="p-6">
          {state.error && (
            <div className="mb-4">
              <ErrorBanner message={t("common.apiError")} />
            </div>
          )}
          {state.loading ? <div className="text-sm text-slate-500">{t("common.loading")}</div> : content}
        </section>
      </main>
    </div>
  );
}
