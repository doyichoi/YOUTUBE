import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeTrends, type AnalysisSections } from "../openai/analyzer.js";
import {
  buildJsonReport,
  buildMarkdownReport,
} from "../report/markdown.js";
import type { ResearchInput, ResearchResult } from "../types.js";
import { runSearchAgent } from "./searchAgent.js";
import { runVideoStatsAgent } from "./videoStatsAgent.js";

export interface OrchestratorOptions {
  input: ResearchInput;
  outputDir?: string;
  skipLlm?: boolean;
  writeReports?: boolean;
  onProgress?: (message: string) => void;
}

export interface OrchestratorOutput {
  result: ResearchResult;
  analysis: AnalysisSections;
  markdown: string;
  markdownPath?: string;
  jsonPath?: string;
}

export async function runOrchestrator(
  options: OrchestratorOptions
): Promise<OrchestratorOutput> {
  const {
    input,
    outputDir = "./reports",
    skipLlm = false,
    writeReports = true,
    onProgress,
  } = options;

  const log = (msg: string) => {
    console.log(msg);
    onProgress?.(msg);
  };

  log(`[Orchestrator] 키워드 "${input.keyword}" 리서치 시작…`);

  log("[① Search Agent] YouTube 검색 중…");
  const searchResults = await runSearchAgent(input);
  log(`  → ${searchResults.length}개 영상 ID 수집`);

  log("[② Video Stats Agent] 통계·급상승 스코어 계산 중…");
  const videos = await runVideoStatsAgent(searchResults);
  const top10 = videos.slice(0, 10);

  const result: ResearchResult = {
    input,
    searchedAt: new Date().toISOString(),
    videos,
    top10,
  };

  let analysis: AnalysisSections = {
    trendingTopics: "_LLM 분석 생략 (--skip-llm)_",
    titlePatterns: "_LLM 분석 생략_",
    contentIdeas: "_LLM 분석 생략_",
  };

  if (!skipLlm) {
    log("[OpenAI] 트렌드 분석 생성 중…");
    analysis = await analyzeTrends(result);
  }

  const markdown = buildMarkdownReport(result, analysis);

  let markdownPath: string | undefined;
  let jsonPath: string | undefined;

  if (writeReports) {
    const json = buildJsonReport(result, analysis, markdown);
    await mkdir(outputDir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const safeKeyword = input.keyword.replace(/[^\w가-힣]+/gu, "-").slice(0, 40);
    const baseName = `trend-report_${stamp}_${safeKeyword}`;

    markdownPath = path.join(outputDir, `${baseName}.md`);
    jsonPath = path.join(outputDir, `${baseName}.json`);

    await writeFile(markdownPath, markdown, "utf8");
    await writeFile(jsonPath, JSON.stringify(json, null, 2), "utf8");

    log(`[완료] Markdown: ${markdownPath}`);
    log(`[완료] JSON: ${jsonPath}`);
  }

  return { result, analysis, markdown, markdownPath, jsonPath };
}
