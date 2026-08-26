import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

type ConfirmVariant = "danger" | "primary";

type ConfirmOptions = {
  title: string;
  message: string;
  warning?: string;
  confirmLabel: string;
  variant?: ConfirmVariant;
};

type ConfirmState = ConfirmOptions & {
  resolve: (confirmed: boolean) => void;
};

export function useConfirmDialog() {
  const { t } = useTranslation();
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      setState({ ...options, resolve });
    });

  const close = (confirmed: boolean) => {
    state?.resolve(confirmed);
    setState(null);
  };

  const dialog = state ? (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-6">
      <div className="w-full max-w-lg rounded-md border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md bg-amber-100 p-2 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">{state.title}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{state.message}</p>
            {state.warning && <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-300">{state.warning}</p>}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={() => close(false)}>{t("common.cancel")}</button>
          <button className={state.variant === "primary" ? "btn btn-primary" : "btn btn-danger"} onClick={() => close(true)}>
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}
