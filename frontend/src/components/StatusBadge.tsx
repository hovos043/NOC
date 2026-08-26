import { useTranslation } from "react-i18next";
import type { SshStatus, WhmStatus } from "../types";

export function StatusBadge({ type }: { type: "enabled" | "disabled" | "notImplemented" | "active" | "suspended" | SshStatus | WhmStatus }) {
  const { t } = useTranslation();
  const classes = {
    enabled: "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/25",
    disabled: "bg-slate-500/15 text-slate-300 ring-1 ring-slate-400/20",
    notImplemented: "bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-400/25",
    never_tested: "bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-400/25",
    connected: "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/25",
    failed: "bg-red-400/15 text-red-300 ring-1 ring-red-400/25",
    not_configured: "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/25",
    active: "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/25",
    suspended: "bg-red-400/15 text-red-300 ring-1 ring-red-400/25",
  }[type];

  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${classes}`}>{t(`status.${type}`)}</span>;
}
