"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/shared/components";
import {
  filterRankingsByAuthType,
  sortRankingsAuthTypeFirst,
  type ProviderAuthType,
} from "@/lib/freeProviderRankingsAuthType";
import {
  formatUsageReliability,
  sortRankingsByReliability,
  usageToneClass,
  type UsageDisplay,
} from "@/lib/freeProviderRankingsUsage";
import type { FreeProviderRanking } from "@/lib/freeProviderRankings";

type Translator = ((key: string) => string) & { has?: (key: string) => boolean };

function text(translator: Translator, key: string, fallback: string): string {
  return typeof translator.has === "function" && translator.has(key)
    ? translator(key)
    : fallback;
}

function scoreLabel(score: number): string {
  if (score >= 0.9) return "Elite";
  if (score >= 0.8) return "Excellent";
  if (score >= 0.7) return "Very Good";
  if (score >= 0.6) return "Good";
  if (score >= 0.5) return "Average";
  return "Below Average";
}

function scoreColor(score: number): string {
  if (score >= 0.85) return "text-green-400";
  if (score >= 0.7) return "text-emerald-400";
  if (score >= 0.55) return "text-yellow-400";
  return "text-orange-400";
}

function scoreBar(score: number): string {
  return score >= 0.85
    ? "bg-green-500"
    : score >= 0.7
      ? "bg-emerald-500"
      : score >= 0.55
        ? "bg-yellow-500"
        : "bg-orange-500";
}

function formatElo(elo: number | null | undefined): string {
  if (typeof elo !== "number" || !Number.isFinite(elo)) return "—";
  return Math.round(elo).toString();
}

/** Wording lives here — the helper only decides what is honest to show. */
function usageText(display: UsageDisplay): string {
  if (display.kind === "rate") return `${display.percent}%`;
  if (display.kind === "insufficient") return `${display.requests} calls`;
  return display.windowHours > 0 ? "No traffic" : "Not measured";
}

const CATEGORY_OPTIONS: Array<{ value: string; labelKey: string; fallback: string }> = [
  { value: "", labelKey: "allCategories", fallback: "All categories" },
  { value: "default", labelKey: "categoryDefault", fallback: "Default" },
  { value: "coding", labelKey: "categoryCoding", fallback: "Coding" },
  { value: "review", labelKey: "categoryReview", fallback: "Review" },
  { value: "documentation", labelKey: "categoryDocumentation", fallback: "Documentation" },
  { value: "debugging", labelKey: "categoryDebugging", fallback: "Debugging" },
];

const TYPE_OPTIONS: Array<{ value: string; labelKey: string; fallback: string }> = [
  { value: "", labelKey: "typeAll", fallback: "All types" },
  { value: "noauth", labelKey: "typeNoauth", fallback: "No auth" },
  { value: "oauth", labelKey: "typeOauth", fallback: "OAuth" },
  { value: "apikey", labelKey: "typeApikey", fallback: "API key" },
];

interface RankedModel {
  key: string;
  modelId: string;
  modelName: string;
  score: number;
  eloRaw: number | null;
  confidence: string | null;
  providerId: string;
  providerName: string;
  providerColor: string;
  providerType: ProviderAuthType;
}

function scoreColorClass(score: number): string {
  return scoreColor(score);
}

function collectModels(
  rankings: FreeProviderRanking[],
  intelligenceCategory: string,
): RankedModel[] {
  const rows: RankedModel[] = [];
  for (const ranking of rankings) {
    const model = ranking.topModel;
    if (!model) continue;
    // The API scopes intelligence rows by `category` server-side, so a filter
    // already applied there leaves nothing to drop here; only drop mismatches
    // when the row carries a more specific category than the request.
    if (intelligenceCategory && model.category && model.category !== intelligenceCategory) {
      continue;
    }
    rows.push({
      key: `${ranking.id}:${model.modelId}`,
      modelId: model.modelId,
      modelName: model.modelName,
      score: model.score,
      eloRaw: model.eloRaw,
      confidence: model.confidence,
      providerId: ranking.id,
      providerName: ranking.name,
      providerColor: ranking.color,
      providerType: ranking.category,
    });
  }
  return rows;
}

export default function RankingPage() {
  const t = useTranslations("rankingPage") as unknown as Translator;

  const [rankings, setRankings] = useState<FreeProviderRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [configuredOnly, setConfiguredOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sortByReliability, setSortByReliability] = useState(false);

  const fetchRankings = useCallback(
    async (activeCategory: string, opts: { configuredOnly?: boolean; availableOnly?: boolean }) => {
      setLoading(true);
      setError(false);
      try {
        const params = new URLSearchParams();
        if (activeCategory) params.set("category", activeCategory);
        if (opts.configuredOnly) params.set("configuredOnly", "1");
        if (opts.availableOnly) params.set("availableOnly", "1");
        params.set("withUsage", "1");
        params.set("usageRange", "24h");
        params.set("limit", "100");
        const res = await fetch(`/api/free-provider-rankings?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: unknown = await res.json();
        const list =
          typeof data === "object" && data !== null && "rankings" in data
            ? (data as { rankings?: FreeProviderRanking[] }).rankings
            : undefined;
        setRankings(Array.isArray(list) ? list : []);
      } catch {
        setError(true);
        setRankings([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    // setLoading(true) inside fetchRankings runs synchronously here, but this is
    // an async data fetch on filter change — not a derived-state cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch on filter change
    void fetchRankings(category, { configuredOnly, availableOnly });
  }, [category, configuredOnly, availableOnly, fetchRankings]);

  const displayedProviders = useMemo(() => {
    const filtered = filterRankingsByAuthType(rankings, typeFilter as ProviderAuthType | "");
    const ordered = sortByReliability ? sortRankingsByReliability(filtered) : filtered;
    return sortRankingsAuthTypeFirst(ordered);
  }, [rankings, typeFilter, sortByReliability]);

  const rankedModels = useMemo(
    () => collectModels(displayedProviders, category).sort((a, b) => b.score - a.score),
    [displayedProviders, category],
  );

  const totalModels = useMemo(
    () => rankings.reduce((sum, item) => sum + (item.modelCount || 0), 0),
    [rankings],
  );

  const headerTitle = text(t, "title", "Model ranking");
  const headerSubtitle = text(
    t,
    "subtitle",
    "Rank models by intelligence, reliability and traffic health",
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">{headerTitle}</h1>
          <p className="mt-1 text-sm text-zinc-400">{headerSubtitle}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>
            {text(t, "providerCount", "Providers")}: {rankings.length}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {text(t, "modelCount", "Models")}: {totalModels}
          </span>
        </div>
      </header>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {text(t, "categoryLabel", "Category")}
          </span>
          {CATEGORY_OPTIONS.map((option) => (
            <button
              key={option.value || "all"}
              type="button"
              onClick={() => setCategory(option.value)}
              className={`rounded-full px-3 py-1 text-xs transition ${
                category === option.value
                  ? "bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40"
                  : "bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200"
              }`}
            >
              {text(t, option.labelKey, option.fallback)}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {text(t, "typeLabel", "Type")}
          </span>
          {TYPE_OPTIONS.map((option) => (
            <button
              key={option.value || "all-types"}
              type="button"
              onClick={() => setTypeFilter(option.value)}
              className={`rounded-full px-3 py-1 text-xs transition ${
                typeFilter === option.value
                  ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40"
                  : "bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200"
              }`}
            >
              {text(t, option.labelKey, option.fallback)}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={configuredOnly}
              onChange={(event) => setConfiguredOnly(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800"
            />
            {text(t, "filterConfiguredOnly", "Configured only")}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(event) => setAvailableOnly(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800"
            />
            {text(t, "filterAvailableOnly", "Available only")}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={sortByReliability}
              onChange={(event) => setSortByReliability(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800"
            />
            {text(t, "sortByReliability", "Sort by reliability")}
          </label>
        </div>
      </Card>

      {error ? (
        <Card className="p-6 text-sm text-red-400">
          {text(t, "errorLoading", "Failed to load ranking data.")}
        </Card>
      ) : loading ? (
        <Card className="p-6 text-sm text-zinc-400">
          {text(t, "loading", "Loading ranking…")}
        </Card>
      ) : rankedModels.length === 0 ? (
        <Card className="p-6 text-sm text-zinc-400">
          {text(t, "emptyState", "No ranked models match the current filters.")}
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">
                {text(t, "modelLeaderboard", "Model leaderboard")}
              </h2>
              <p className="text-xs text-zinc-500">
                {text(t, "modelLeaderboardHelp", "Ordered by resolved intelligence score")}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-4 py-2">#</th>
                    <th className="px-4 py-2">{text(t, "colModel", "Model")}</th>
                    <th className="px-4 py-2">{text(t, "colProvider", "Provider")}</th>
                    <th className="px-4 py-2 text-right">{text(t, "colElo", "Elo")}</th>
                    <th className="px-4 py-2 text-right">{text(t, "colScore", "Score")}</th>
                    <th className="px-4 py-2">{text(t, "colTier", "Tier")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedModels.slice(0, 50).map((model, index) => (
                    <tr
                      key={model.key}
                      className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30"
                    >
                      <td className="px-4 py-2 text-zinc-500 tabular-nums">{index + 1}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-col">
                          <span className="text-zinc-100">{model.modelName}</span>
                          <code className="text-[11px] text-zinc-500">{model.modelId}</code>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-1.5 text-zinc-300">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: model.providerColor }}
                            aria-hidden="true"
                          />
                          {model.providerName}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-zinc-400">
                        {formatElo(model.eloRaw)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span
                            className={`h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800`}
                            aria-hidden="true"
                          >
                            <span
                              className={`block h-full rounded-full ${scoreBar(model.score)}`}
                              style={{ width: `${Math.round(model.score * 100)}%` }}
                            />
                          </span>
                          <span className={`tabular-nums font-medium ${scoreColorClass(model.score)}`}>
                            {(model.score * 100).toFixed(0)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`text-xs ${scoreColorClass(model.score)}`}>
                          {scoreLabel(model.score)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">
                {text(t, "providerLeaderboard", "Provider leaderboard")}
              </h2>
              <p className="text-xs text-zinc-500">
                {text(t, "providerLeaderboardHelp", "Ordered by top model score")}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-4 py-2">#</th>
                    <th className="px-4 py-2">{text(t, "colProvider", "Provider")}</th>
                    <th className="px-4 py-2">{text(t, "colTopModel", "Top model")}</th>
                    <th className="px-4 py-2 text-right">{text(t, "colAvgScore", "Avg")}</th>
                    <th className="px-4 py-2 text-right">{text(t, "colModels", "Models")}</th>
                    <th className="px-4 py-2">{text(t, "colReliability", "Health")}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedProviders.map((provider, index) => {
                    const usage = provider.reliability?.usage;
                    const display = formatUsageReliability(usage);
                    return (
                      <tr
                        key={provider.id}
                        className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30"
                      >
                        <td className="px-4 py-2 text-zinc-500 tabular-nums">{index + 1}</td>
                        <td className="px-4 py-2">
                          <span className="inline-flex items-center gap-1.5 text-zinc-100">
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ backgroundColor: provider.color }}
                              aria-hidden="true"
                            />
                            {provider.name}
                          </span>
                          <div className="text-[11px] text-zinc-500">
                            {text(
                              t,
                              `type${provider.category}`,
                              provider.category.toUpperCase(),
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          {provider.topModel ? (
                            <div className="flex flex-col">
                              <span className="text-zinc-300">{provider.topModel.modelName}</span>
                              <span className={`text-[11px] ${scoreColorClass(provider.topModel.score)}`}>
                                {(provider.topModel.score * 100).toFixed(0)} ·{" "}
                                {scoreLabel(provider.topModel.score)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                        <td
                          className={`px-4 py-2 text-right tabular-nums ${scoreColorClass(provider.averageScore)}`}
                        >
                          {(provider.averageScore * 100).toFixed(0)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-zinc-400">
                          {provider.modelCount}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`text-xs ${usageToneClass(display.tone)}`}
                            title={
                              display.kind === "rate"
                                ? `${display.successes}/${display.requests}`
                                : undefined
                            }
                          >
                            {usageText(display)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
