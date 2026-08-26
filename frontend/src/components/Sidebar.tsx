import { useTranslation } from "react-i18next";
import type { ComponentType } from "react";
import { Activity, Bell, FileText, Gauge, LayoutDashboard, Search, Server, Settings, Terminal, Users } from "lucide-react";
import type { PageKey } from "../App";

type Item = {
  key: PageKey;
  icon: ComponentType<{ className?: string }>;
};

const items: Item[] = [
  { key: "dashboard", icon: LayoutDashboard },
  { key: "servers", icon: Server },
  { key: "accounts", icon: Users },
  { key: "commands", icon: Terminal },
  { key: "search", icon: Search },
  { key: "alerts", icon: Bell },
  { key: "logs", icon: FileText },
  { key: "diagnostics", icon: Gauge },
  { key: "settings", icon: Settings },
];

export function Sidebar({ active, onNavigate }: { active: PageKey; onNavigate: (page: PageKey) => void }) {
  const { t } = useTranslation();

  return (
    <aside className="sidebar-shell flex w-72 shrink-0 flex-col text-slate-100">
      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-600 shadow-lg shadow-blue-600/25">
          <Activity className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">{t("app.name")}</div>
          <div className="truncate text-xs text-slate-400">{t("app.localOnly")}</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => {
          const Icon = item.icon;
          const selected = active === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition ${
                selected ? "bg-cyan-500/20 text-white ring-1 ring-cyan-300/30 shadow-lg shadow-cyan-900/30" : "text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{t(`nav.${item.key}`)}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
