import { useEffect, useRef, useState } from "react";
import { Bot, Clipboard, Copy, Plug, PlugZap, RotateCcw } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "./StatusBadge";
import { getAuthToken } from "../api/client";
import type { Server } from "../types";

type InteractiveState = "disconnected" | "connecting" | "connected" | "error";

const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL ?? "ws://127.0.0.1:8765/ws";

export function InteractiveTerminal({ server }: { server: Server }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<InteractiveState>("disconnected");
  const [showWarning, setShowWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codexCopied, setCodexCopied] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: "Consolas, 'Courier New', monospace",
      fontSize: 13,
      theme: {
        background: "#020617",
        foreground: "#e2e8f0",
        cursor: "#38bdf8",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(containerRef.current);
    fit.fit();
    terminal.writeln(t("terminal.interactiveReady"));
    terminal.onData((data) => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "input", data }));
      }
    });
    terminalRef.current = terminal;
    fitRef.current = fit;

    const observer = new ResizeObserver(() => {
      fit.fit();
      sendResize();
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      socketRef.current?.close();
      terminal.dispose();
    };
  }, [t]);

  const connect = () => {
    setShowWarning(true);
  };

  const startConnection = async () => {
    setShowWarning(false);
    setError(null);
    setState("connecting");
    terminalRef.current?.clear();
    terminalRef.current?.writeln(t("terminal.connecting"));
    const token = await getAuthToken();
    const socket = new WebSocket(`${WS_BASE_URL}/servers/${server.id}/terminal?token=${encodeURIComponent(token)}`);
    socketRef.current = socket;
    socket.onopen = () => {
      sendResize();
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as { type: string; data?: string; status?: string; message?: string };
        if (message.type === "output") {
          terminalRef.current?.write(message.data ?? "");
        }
        if (message.type === "status") {
          if (message.status === "connected") {
            setState("connected");
          }
          if (message.status === "closed") {
            setState("disconnected");
            terminalRef.current?.writeln("");
            terminalRef.current?.writeln(message.message === "idle_timeout" ? t("terminal.idleTimeout") : t("terminal.sessionClosed"));
            socket.close();
          }
          if (message.status === "error") {
            setState("error");
            const translated = message.message ? t(`sshErrors.${message.message}`, { defaultValue: message.message }) : t("terminal.connectionFailed");
            setError(translated);
            terminalRef.current?.writeln(translated);
          }
        }
      } catch {
        terminalRef.current?.write(String(event.data));
      }
    };
    socket.onerror = () => {
      setState("error");
      setError(t("terminal.connectionFailed"));
    };
    socket.onclose = () => {
      setState((current) => (current === "error" ? "error" : "disconnected"));
    };
  };

  const disconnect = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "disconnect" }));
    }
    socketRef.current?.close();
    setState("disconnected");
  };

  const sendResize = () => {
    if (socketRef.current?.readyState !== WebSocket.OPEN || !terminalRef.current) return;
    socketRef.current.send(JSON.stringify({ type: "resize", cols: terminalRef.current.cols, rows: terminalRef.current.rows }));
  };

  const copySelection = () => {
    const selection = terminalRef.current?.getSelection();
    if (selection) void navigator.clipboard.writeText(selection);
  };

  const pasteClipboard = async () => {
    const text = await navigator.clipboard.readText();
    if (text && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "input", data: text }));
    }
  };

  const copyCodexAttachContext = async () => {
    const version = await window.nameamNoc?.getAppVersion?.();
    const text = t("codex.terminalAttachContext", {
      displayName: server.display_name || server.hostname,
      id: server.id,
      hostname: server.hostname,
      sshStatus: server.ssh_status,
      whmStatus: server.whm_status,
      terminalStatus: state,
      appVersion: version || "-",
    });
    await navigator.clipboard.writeText(text);
    setCodexCopied(true);
    window.setTimeout(() => setCodexCopied(false), 1800);
  };

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{t("terminal.interactiveTitle", { hostname: server.hostname })}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>{t("terminal.connectionStatus")}</span>
            <StatusBadge type={state === "connected" ? "connected" : state === "error" ? "failed" : "disabled"} />
            <span>{t("terminal.connectedUser", { username: server.ssh_username || "-" })}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary" onClick={connect} disabled={!server.enabled || state === "connected" || state === "connecting"}>
            <PlugZap className="h-4 w-4" />
            {state === "connecting" ? t("terminal.connecting") : t("terminal.connect")}
          </button>
          <button className="btn btn-secondary" onClick={disconnect} disabled={state !== "connected"}>
            <Plug className="h-4 w-4" />
            {t("terminal.disconnect")}
          </button>
          <button className="btn btn-secondary" onClick={() => terminalRef.current?.clear()}>
            <RotateCcw className="h-4 w-4" />
            {t("terminal.clearOutput")}
          </button>
          <button className="btn btn-secondary" onClick={copySelection}>
            <Copy className="h-4 w-4" />
            {t("terminal.copySelected")}
          </button>
          <button className="btn btn-secondary" onClick={() => void pasteClipboard()} disabled={state !== "connected"}>
            <Clipboard className="h-4 w-4" />
            {t("terminal.paste")}
          </button>
          <button className="btn btn-primary" onClick={() => void copyCodexAttachContext()} disabled={state !== "connected"}>
            <Bot className="h-4 w-4" />
            {codexCopied ? t("codex.copiedForCodex") : t("codex.attachTerminal")}
          </button>
        </div>
      </div>
      <p className="mt-3 text-sm text-amber-600 dark:text-amber-300">{t("terminal.interactiveWarningShort")}</p>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-300">{error}</p>}
      <div ref={containerRef} className="mt-4 h-[520px] overflow-hidden rounded-md bg-slate-950 p-2" />

      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6">
          <div className="w-full max-w-lg rounded-md bg-white p-5 shadow-xl dark:bg-slate-900">
            <h3 className="text-lg font-semibold">{t("terminal.adminWarningTitle")}</h3>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{t("terminal.adminWarningDescription")}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setShowWarning(false)}>{t("common.cancel")}</button>
              <button className="btn btn-danger" onClick={() => void startConnection()}>{t("terminal.understandConnect")}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
