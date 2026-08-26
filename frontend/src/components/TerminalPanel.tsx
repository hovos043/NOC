import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, Copy, Play, Plug, PlugZap, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { ErrorBanner } from "./ErrorBanner";
import { StatusBadge } from "./StatusBadge";
import { InteractiveTerminal } from "./InteractiveTerminal";
import { useConfirmDialog } from "./ConfirmDialog";
import type { CommandExecuteResult, CommandHistoryItem, CommandSafetyResult, SavedCommand, Server } from "../types";

type TerminalState = "disconnected" | "connecting" | "connected" | "error" | "not_configured";

export function TerminalPanel({ server }: { server: Server }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"interactive" | "executor">("interactive");

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-md border border-slate-200 bg-white p-1 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <button className={`rounded px-3 py-1.5 ${mode === "interactive" ? "bg-blue-600 text-white" : "text-slate-600 dark:text-slate-300"}`} onClick={() => setMode("interactive")}>
          {t("terminal.interactiveMode")}
        </button>
        <button className={`rounded px-3 py-1.5 ${mode === "executor" ? "bg-blue-600 text-white" : "text-slate-600 dark:text-slate-300"}`} onClick={() => setMode("executor")}>
          {t("terminal.executorMode")}
        </button>
      </div>
      {mode === "interactive" ? <InteractiveTerminal server={server} /> : <CommandExecutorPanel server={server} />}
    </div>
  );
}

function CommandExecutorPanel({ server }: { server: Server }) {
  const { t } = useTranslation();
  const [state, setState] = useState<TerminalState>("disconnected");
  const [command, setCommand] = useState("");
  const [output, setOutput] = useState<CommandExecuteResult[]>([]);
  const [history, setHistory] = useState<CommandHistoryItem[]>([]);
  const [savedCommands, setSavedCommands] = useState<SavedCommand[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [pendingSafety, setPendingSafety] = useState<CommandSafetyResult | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirmDialog();

  const loadPanels = useCallback(async () => {
    const [historyItems, saved] = await Promise.all([api.terminalHistory(server.id), api.listSavedCommands()]);
    setHistory(historyItems);
    setSavedCommands(saved);
  }, [server.id]);

  useEffect(() => {
    void loadPanels().catch(() => setError(t("errors.loadTerminal")));
  }, [loadPanels, t]);

  const connect = async () => {
    setBusy(true);
    setState("connecting");
    setError(null);
    try {
      const result = await api.terminalConnect(server.id);
      setState(result.status);
      if (!result.success) setError(result.error_message ? t(`sshErrors.${result.error_message}`, { defaultValue: result.error_message }) : t("terminal.connectionFailed"));
    } catch {
      setState("error");
      setError(t("terminal.connectionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.terminalDisconnect(server.id);
      setState("disconnected");
    } catch {
      setError(t("terminal.disconnectFailed"));
    } finally {
      setBusy(false);
    }
  };

  const run = async (confirmedText?: string) => {
    const trimmed = command.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      if (!confirmedText) {
        const safety = await api.terminalPrepare(server.id, trimmed);
        if (safety.is_blocked) {
          setError(t("terminal.blockedCommand"));
          return;
        }
        if (safety.is_dangerous) {
          setPendingSafety(safety);
          return;
        }
      }
      const result = await api.terminalExecute(server.id, trimmed, confirmedText);
      setOutput((current) => [result, ...current]);
      setCommand("");
      setPendingSafety(null);
      setConfirmation("");
      await loadPanels();
    } catch (exc) {
      setError(t("terminal.commandFailed"));
    } finally {
      setBusy(false);
    }
  };

  const saveCommand = async () => {
    const trimmed = command.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await api.createSavedCommand({ title: trimmed.slice(0, 60), command: trimmed, category: "Custom" });
      setSavedCommands(await api.listSavedCommands());
    } catch {
      setError(t("terminal.saveCommandFailed"));
    } finally {
      setBusy(false);
    }
  };

  const deleteSaved = async (item: SavedCommand) => {
    const confirmed = await confirm({
      title: t("confirm.deleteSavedCommandTitle"),
      message: t("terminal.confirmDeleteSaved", { title: item.title }),
      warning: t("confirm.deleteSavedCommandWarning"),
      confirmLabel: t("common.delete"),
    });
    if (!confirmed) return;
    await api.deleteSavedCommand(item.id);
    setSavedCommands(await api.listSavedCommands());
  };

  const allOutput = output.map((item) => `$ ${item.command}\n${item.stdout}${item.stderr ? `\n${item.stderr}` : ""}`).join("\n\n");

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">{t("terminal.title", { hostname: server.hostname })}</h3>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <span>{t("terminal.connectionStatus")}</span>
            <StatusBadge type={state === "connected" ? "connected" : state === "not_configured" ? "not_configured" : state === "error" ? "failed" : "disabled"} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary" onClick={connect} disabled={busy || state === "connected" || !server.enabled}>
            <PlugZap className="h-4 w-4" />
            {state === "connecting" ? t("terminal.connecting") : t("terminal.connect")}
          </button>
          <button className="btn btn-secondary" onClick={disconnect} disabled={busy || state !== "connected"}>
            <Plug className="h-4 w-4" />
            {t("terminal.disconnect")}
          </button>
        </div>
      </div>

      {error && <div className="mt-3"><ErrorBanner message={error} /></div>}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              className="input font-mono"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder={t("terminal.commandPlaceholder")}
              disabled={state !== "connected" || busy}
              onKeyDown={(event) => {
                if (event.key === "Enter") void run();
              }}
            />
            <button className="btn btn-primary" onClick={() => void run()} disabled={state !== "connected" || busy || !command.trim()}>
              <Play className="h-4 w-4" />
              {t("terminal.run")}
            </button>
            <button className="btn btn-secondary" onClick={saveCommand} disabled={!command.trim() || busy}>
              <Save className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary" onClick={() => setOutput([])}>
              <RotateCcw className="h-4 w-4" />
              {t("terminal.clearOutput")}
            </button>
            <button className="btn btn-secondary" onClick={() => navigator.clipboard.writeText(allOutput)} disabled={!allOutput}>
              <Copy className="h-4 w-4" />
              {t("terminal.copyOutput")}
            </button>
          </div>

          <div className="min-h-72 rounded-md bg-slate-950 p-4 font-mono text-xs text-slate-100">
            {output.length === 0 ? (
              <div className="text-slate-500">{t("terminal.noOutput")}</div>
            ) : (
              output.map((item, index) => (
                <div key={`${item.command}-${index}`} className="mb-5 whitespace-pre-wrap">
                  <div className="text-blue-300">$ {item.command}</div>
                  {item.stdout && <div>{item.stdout}</div>}
                  {item.stderr && <div className="text-red-300">{item.stderr}</div>}
                  {(item.stdout_truncated || item.stderr_truncated) && <div className="mt-2 text-amber-300">{t("terminal.outputTruncated")}</div>}
                  <div className="mt-2 text-slate-400">
                    {t("terminal.exitMeta", { exitCode: item.exit_code ?? "-", duration: item.duration_ms })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <aside className="grid gap-4">
          <Panel title={t("terminal.savedCommands")}>
            {savedCommands.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-slate-950">
                <button className="min-w-0 flex-1 truncate text-left" onClick={() => setCommand(item.command)} title={item.command}>
                  <span className="font-medium">{item.title}</span>
                  <span className="ml-2 text-xs text-slate-500">{item.category}</span>
                </button>
                <button className="text-slate-500 hover:text-red-500" onClick={() => void deleteSaved(item)} title={t("common.delete")}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </Panel>
          <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
            <button className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold" onClick={() => setShowHistory((current) => !current)}>
              <span>{t("terminal.commandHistory")}</span>
              <span className="inline-flex items-center gap-1 text-xs font-normal text-slate-500">
                {history.length}
                {showHistory ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </span>
            </button>
            {showHistory && (
              <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                {history.length === 0 ? (
                  <p className="text-sm text-slate-500">{t("terminal.noHistory")}</p>
                ) : (
                  history.slice(0, 8).map((item) => (
                    <button key={item.id} className="block w-full truncate rounded-md bg-slate-50 px-3 py-2 text-left font-mono text-xs dark:bg-slate-950" onClick={() => setCommand(item.command)} title={item.command}>
                      {item.command}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {pendingSafety && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6">
          <div className="w-full max-w-lg rounded-md bg-white p-5 shadow-xl dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold">{t("terminal.dangerTitle")}</h3>
              <button onClick={() => setPendingSafety(null)}><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{t("terminal.dangerDescription")}</p>
            <div className="mt-3 rounded-md bg-slate-100 p-3 font-mono text-sm dark:bg-slate-950">{pendingSafety.command}</div>
            <label className="mt-4 block">
              <span className="field-label">{t("terminal.confirmationLabel", { text: pendingSafety.confirmation_text })}</span>
              <input className="input mt-1" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setPendingSafety(null)}>{t("common.cancel")}</button>
              <button className="btn btn-danger" disabled={confirmation !== pendingSafety.confirmation_text || busy} onClick={() => void run(confirmation)}>
                {t("terminal.runDangerous")}
              </button>
            </div>
          </div>
        </div>
      )}
      {dialog}
    </section>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      <div className="max-h-64 space-y-2 overflow-y-auto">{children}</div>
    </div>
  );
}
