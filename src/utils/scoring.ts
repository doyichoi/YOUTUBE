import type { SurgeLabel } from "../types.js";

export function hoursSince(isoDate: string, now = new Date()): number {
  const published = new Date(isoDate).getTime();
  const diffMs = now.getTime() - published;
  return Math.max(diffMs / (1000 * 60 * 60), 1 / 60);
}

export function viewsPerHour(viewCount: number, hours: number): number {
  return viewCount / Math.max(1, hours);
}

/** 명세서 3.2 급상승 판정 기준 */
export function classifySurge(
  viewsPerHourScore: number,
  hoursSincePublished: number
): SurgeLabel {
  if (hoursSincePublished <= 24 && viewsPerHourScore > 10_000) return "fire";
  if (hoursSincePublished <= 24 * 7 && viewsPerHourScore > 3_000) return "rising";
  return "normal";
}

export function surgeEmoji(label: SurgeLabel): string {
  switch (label) {
    case "fire":
      return "🔥";
    case "rising":
      return "📈";
    default:
      return "";
  }
}

export function publishedAfterIso(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString();
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n));
}
