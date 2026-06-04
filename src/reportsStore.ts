import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface StoredReport {
  id: string;
  generatedAt: string;
  keyword: string;
  input: {
    keyword: string;
    daysBack: number;
    maxResults: number;
    regionCode: string;
    language: string;
  };
  top10: Array<{
    videoId: string;
    title: string;
    channelId: string;
    channelTitle: string;
    thumbnailUrl: string;
    viewCount: number;
    viewsPerHour: number;
    surgeLabel: string;
  }>;
  analysis: {
    trendingTopics: string;
    titlePatterns: string;
    contentIdeas: string;
  };
  markdown: string;
  coverThumbnail?: string;
  excerpt?: string;
}

export interface GlobalInsights {
  updatedAt: string;
  reportCount: number;
  topics: Array<{ label: string; count: number }>;
  channels: Array<{ name: string; videos: number; totalViews: number }>;
  contentPulse: {
    totalVideosAnalyzed: number;
    avgViewsPerHour: number;
    fireCount: number;
    risingCount: number;
  };
  highlights: string[];
}

function excerptFromMarkdown(md: string, max = 140): string {
  const line = md
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").trim())
    .find((l) => l.length > 20 && !l.startsWith("|") && !l.startsWith(">"));
  const text = line ?? md.slice(0, max);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function excerptFromAnalysis(analysis: StoredReport["analysis"]): string {
  const t = analysis.trendingTopics.replace(/[#*_]/g, "").trim();
  const first = t.split("\n").find((l) => l.trim().length > 10);
  return first?.slice(0, 160) ?? "트렌드 리포트";
}

export async function listReports(reportsDir: string): Promise<StoredReport[]> {
  let files: string[];
  try {
    files = await readdir(reportsDir);
  } catch {
    return [];
  }

  const jsonFiles = files.filter((f) => f.endsWith(".json"));
  const reports: StoredReport[] = [];

  for (const file of jsonFiles) {
    try {
      const raw = await readFile(path.join(reportsDir, file), "utf8");
      const data = JSON.parse(raw) as StoredReport & { input?: StoredReport["input"] };
      const id = file.replace(/\.json$/, "");
      const keyword = data.input?.keyword ?? id;
      const top10 = data.top10 ?? [];
      reports.push({
        id,
        generatedAt: data.generatedAt ?? new Date().toISOString(),
        keyword,
        input: data.input ?? {
          keyword,
          daysBack: 7,
          maxResults: 25,
          regionCode: "KR",
          language: "ko",
        },
        top10,
        analysis: data.analysis ?? {
          trendingTopics: "",
          titlePatterns: "",
          contentIdeas: "",
        },
        markdown: data.markdown ?? "",
        coverThumbnail: top10[0]?.thumbnailUrl,
        excerpt: excerptFromAnalysis(data.analysis ?? { trendingTopics: "", titlePatterns: "", contentIdeas: "" })
          || excerptFromMarkdown(data.markdown ?? ""),
      });
    } catch {
      /* skip corrupt */
    }
  }

  return reports.sort(
    (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
  );
}

export async function getReport(
  reportsDir: string,
  id: string
): Promise<StoredReport | null> {
  const safeId = id.replace(/[^a-zA-Z0-9._\uac00-\ud7a3-]/g, "");
  if (!safeId) return null;
  try {
    const raw = await readFile(path.join(reportsDir, `${safeId}.json`), "utf8");
    const data = JSON.parse(raw) as StoredReport & {
      input?: StoredReport["input"];
      top10?: StoredReport["top10"];
      analysis?: StoredReport["analysis"];
    };
    const keyword = data.input?.keyword ?? safeId;
    const top10 = data.top10 ?? [];
    const analysis = data.analysis ?? {
      trendingTopics: "",
      titlePatterns: "",
      contentIdeas: "",
    };
    return {
      id: safeId,
      generatedAt: data.generatedAt ?? new Date().toISOString(),
      keyword,
      input: data.input ?? {
        keyword,
        daysBack: 7,
        maxResults: 25,
        regionCode: "KR",
        language: "ko",
      },
      top10,
      analysis,
      markdown: data.markdown ?? "",
      coverThumbnail: top10[0]?.thumbnailUrl,
      excerpt:
        excerptFromAnalysis(analysis) ||
        excerptFromMarkdown(data.markdown ?? ""),
    };
  } catch {
    return null;
  }
}

export function buildGlobalInsights(reports: StoredReport[]): GlobalInsights {
  const topicCounts = new Map<string, number>();
  const channelMap = new Map<string, { videos: number; totalViews: number }>();
  let totalVideos = 0;
  let vphSum = 0;
  let vphN = 0;
  let fireCount = 0;
  let risingCount = 0;
  const highlights: string[] = [];

  for (const r of reports) {
    topicCounts.set(r.keyword, (topicCounts.get(r.keyword) ?? 0) + 1);
    const excerpt = r.excerpt ?? r.keyword;
    if (highlights.length < 5) highlights.push(`${r.keyword}: ${excerpt.slice(0, 80)}`);

    for (const v of r.top10 ?? []) {
      totalVideos += 1;
      vphSum += v.viewsPerHour ?? 0;
      vphN += 1;
      if (v.surgeLabel === "fire") fireCount += 1;
      if (v.surgeLabel === "rising") risingCount += 1;

      const ch = channelMap.get(v.channelTitle) ?? { videos: 0, totalViews: 0 };
      ch.videos += 1;
      ch.totalViews += v.viewCount ?? 0;
      channelMap.set(v.channelTitle, ch);
    }
  }

  const topics = [...topicCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const channels = [...channelMap.entries()]
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.totalViews - a.totalViews)
    .slice(0, 6);

  return {
    updatedAt: new Date().toISOString(),
    reportCount: reports.length,
    topics,
    channels,
    contentPulse: {
      totalVideosAnalyzed: totalVideos,
      avgViewsPerHour: vphN ? Math.round(vphSum / vphN) : 0,
      fireCount,
      risingCount,
    },
    highlights,
  };
}
