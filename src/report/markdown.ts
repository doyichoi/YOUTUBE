import type { AnalysisSections } from "../openai/analyzer.js";
import type { ResearchResult, VideoStatsItem } from "../types.js";
import { formatNumber, surgeEmoji } from "../utils/scoring.js";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function row(video: VideoStatsItem, rank: number): string {
  const badge = surgeEmoji(video.surgeLabel);
  return `| ${rank} | ${badge} ${video.title.replace(/\|/g, "\\|")} | ${video.channelTitle.replace(/\|/g, "\\|")} | ${formatNumber(video.viewCount)} | ${formatDate(video.publishedAt)} | ${formatNumber(video.viewsPerHour)} |`;
}

export function buildMarkdownReport(
  result: ResearchResult,
  analysis: AnalysisSections
): string {
  const date = new Date().toLocaleDateString("ko-KR");
  const header = [
    "# YouTube 트렌드 리포트",
    "",
    `생성일: ${date} | 분석 키워드: **${result.input.keyword}** | 기간: 최근 ${result.input.daysBack}일 | 지역: ${result.input.regionCode}`,
    "",
    "> 분석 엔진: OpenAI GPT (MVP — 명세서 Claude 대체)",
    "",
    "## 🔥 이번 주 급상승 토픽",
    "",
    analysis.trendingTopics,
    "",
    "## 📊 상위 영상 분석 (Top 10)",
    "",
    "| 순위 | 제목 | 채널 | 조회수 | 게시일 | 급상승 스코어 (시간당 조회) |",
    "|------|-----|------|-------|--------|---------------------------|",
    ...result.top10.map((v, i) => row(v, i + 1)),
    "",
    "## 💡 제목 패턴 인사이트",
    "",
    analysis.titlePatterns,
    "",
    "## 🚀 채널별 콘텐츠 아이디어",
    "",
    analysis.contentIdeas,
    "",
  ];

  return header.join("\n");
}

export function buildJsonReport(
  result: ResearchResult,
  analysis: AnalysisSections,
  markdown: string
): object {
  return {
    generatedAt: result.searchedAt,
    input: result.input,
    top10: result.top10,
    videos: result.videos,
    analysis,
    markdown,
  };
}
