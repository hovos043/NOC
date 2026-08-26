import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TerminalPanel } from "../components/TerminalPanel";
import type { Server } from "../types";

export function CommandRunnerPage({ servers }: { servers: Server[] }) {
  const { t } = useTranslation();
  const [serverId, setServerId] = useState<number | "">(servers[0]?.id ?? "");
  const selected = servers.find((server) => server.id === serverId);

  useEffect(() => {
    if (servers.length === 0) {
      setServerId("");
      return;
    }
    if (!servers.some((server) => server.id === serverId)) {
      setServerId(servers[0].id);
    }
  }, [serverId, servers]);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-3 md:grid-cols-[320px_1fr]">
          <label>
            <span className="field-label">{t("terminal.selectServer")}</span>
            <select className="input mt-1" value={serverId} onChange={(event) => setServerId(Number(event.target.value))}>
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.hostname}{server.enabled ? "" : ` (${t("status.disabled")})`}
                </option>
              ))}
            </select>
          </label>
          <div className="text-sm text-slate-500">{t("terminal.singleServerOnly")}</div>
        </div>
      </div>
      {selected ? <TerminalPanel server={selected} /> : <div className="text-sm text-slate-500">{t("terminal.noEnabledServers")}</div>}
    </div>
  );
}
