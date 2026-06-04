import OpenAI from "openai";
import type { ResearchResult } from "../types.js";

const SYSTEM_PROMPT = `당신은 YouTube 콘텐츠 트렌드 분석 전문가입니다.
한국어로 답변하며, 데이터에 근거한 구체적인 인사이트를 제공합니다.
과장하지 말고, 제공된 JSON 수치를 인용하세요.`;

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY가 설정되지 않았습니다. .env.example을 참고해 .env를 만드세요."
    );
  }
  return new OpenAI({ apiKey });
}

function getModel(): string {
  return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
}

export interface AnalysisSections {
  trendingTopics: string;
  titlePatterns: string;
  contentIdeas: string;
}

export async function analyzeTrends(
  result: ResearchResult
): Promise<AnalysisSections> {
  const client = getClient();
  const model = getModel();

  const payload = {
    keyword: result.input.keyword,
    daysBack: result.input.daysBack,
    top10: result.top10.map((v) => ({
      title: v.title,
      channel: v.channelTitle,
      viewCount: v.viewCount,
      viewsPerHour: Math.round(v.viewsPerHour),
      surgeLabel: v.surgeLabel,
      publishedAt: v.publishedAt,
    })),
    allTitles: result.videos.slice(0, 50).map((v) => v.title),
  };

  const userPrompt = `다음 YouTube 수집 데이터를 분석해 주세요.

## 데이터 (JSON)
${JSON.stringify(payload, null, 2)}

## 요청 (각 섹션을 마크다운으로, 아래 제목을 반드시 포함)

### TASK 1 — 트렌드 요약
급부상 중인 토픽 3~5개, 각 2~3줄 해설

### TASK 2 — 제목 패턴 분석
자주 등장하는 패턴(숫자형, 의문형, 비교형 등)과 추천 제목 공식 2~3개

### TASK 3 — 채널별 콘텐츠 아이디어
다음 세 채널 각각 3~5개 아이디어 + 추천 제목 후보:
- NextPlatform 블로그 (NXP)
- AI 뉴스 채널
- 쇼츠`;

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.4,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  return splitAnalysisSections(text);
}

function splitAnalysisSections(fullText: string): AnalysisSections {
  const task1 = extractSection(fullText, /TASK\s*1|트렌드\s*요약/i, /TASK\s*2|제목\s*패턴/i);
  const task2 = extractSection(fullText, /TASK\s*2|제목\s*패턴/i, /TASK\s*3|콘텐츠\s*아이디어|채널별/i);
  const task3 = extractSection(fullText, /TASK\s*3|콘텐츠\s*아이디어|채널별/i);

  return {
    trendingTopics: task1 || fullText,
    titlePatterns: task2 || "(패턴 분석을 파싱하지 못했습니다. 전체 응답을 참고하세요.)",
    contentIdeas: task3 || "(콘텐츠 아이디어를 파싱하지 못했습니다.)",
  };
}

function extractSection(
  text: string,
  startPattern: RegExp,
  endPattern?: RegExp
): string {
  const startMatch = text.search(startPattern);
  if (startMatch === -1) return "";

  const afterStart = text.slice(startMatch);
  const relativeEnd =
    endPattern === undefined ? -1 : afterStart.slice(1).search(endPattern);
  const section =
    relativeEnd === -1
      ? afterStart.replace(/^#+\s*[^\n]+\n?/i, "").trim()
      : afterStart
          .slice(0, relativeEnd + 1)
          .replace(/^#+\s*[^\n]+\n?/i, "")
          .trim();

  return section;
}
