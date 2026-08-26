import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { api } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { StatusBadge } from "../components/StatusBadge";
import type { AccountSearchResult } from "../types";

export function GlobalSearchPage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AccountSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      setResults(await api.searchAccounts(query.trim()));
    } catch {
      setError(t("errors.searchAccounts"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} />}
      <form className="flex max-w-2xl gap-2" onSubmit={submit}>
        <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search.placeholder")} />
        <button className="btn btn-primary" type="submit" disabled={loading}>
          <Search className="h-4 w-4" />
          {t("common.search")}
        </button>
      </form>

      {loading ? (
        <div className="text-sm text-slate-500">{t("common.loading")}</div>
      ) : searched && results.length === 0 ? (
        <EmptyState title={t("search.emptyTitle")} description={t("search.emptyDescription")} />
      ) : results.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="w-44 px-3 py-3">{t("accounts.server")}</th>
                <th className="w-32 px-3 py-3">{t("accounts.username")}</th>
                <th className="w-56 px-3 py-3">{t("accounts.domain")}</th>
                <th className="w-32 px-3 py-3">{t("accounts.package")}</th>
                <th className="w-28 px-3 py-3 text-center">{t("accounts.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {results.map((result) => (
                <tr key={result.id} className="hover:bg-slate-50 dark:hover:bg-slate-950">
                  <td className="truncate px-3 py-3">{result.server}</td>
                  <td className="truncate px-3 py-3">{result.username}</td>
                  <td className="truncate px-3 py-3 font-medium">{result.domain}</td>
                  <td className="truncate px-3 py-3">{result.package || "-"}</td>
                  <td className="px-3 py-3 text-center">
                    <StatusBadge type={result.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={t("search.readyTitle")} description={t("search.readyDescription")} />
      )}
    </div>
  );
}
