import "dotenv/config";
import { runOrchestrator } from "./agents/orchestrator.js";
import type { ResearchInput } from "./types.js";

function printUsage(): void {
  console.log(`
YouTube 트렌드 리서치 에이전트 (Phase 1 MVP)

사용법:
  npm run research -- <키워드> [옵션]

옵션:
  --days <n>        검색 기간 (기본: 7)
  --max <n>         search.list 최대 결과 (기본: 25, 최대 50)
  --region <code>   regionCode (기본: KR)
  --lang <code>     relevanceLanguage (기본: ko)
  --out <dir>       리포트 저장 경로 (기본: ./reports)
  --skip-llm        OpenAI 분석 생략 (YouTube 데이터만)

환경 변수 (.env):
  YOUTUBE_API_KEY   필수
  OPENAI_API_KEY    --skip-llm 없을 때 필수
  OPENAI_MODEL      선택 (기본: gpt-4o-mini)

예시:
  npm run research -- "AI 에이전트"
  npm run research -- "ChatGPT" --days 30 --max 50
`);
}

function parseArgs(argv: string[]): {
  keyword: string | null;
  input: ResearchInput;
  outputDir: string;
  skipLlm: boolean;
} {
  const positional: string[] = [];
  let daysBack = 7;
  let maxResults = 25;
  let regionCode = "KR";
  let language = "ko";
  let outputDir = "./reports";
  let skipLlm = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--days":
        daysBack = Number(argv[++i] ?? 7);
        break;
      case "--max":
        maxResults = Math.min(Number(argv[++i] ?? 25), 50);
        break;
      case "--region":
        regionCode = argv[++i] ?? "KR";
        break;
      case "--lang":
        language = argv[++i] ?? "ko";
        break;
      case "--out":
        outputDir = argv[++i] ?? "./reports";
        break;
      case "--skip-llm":
        skipLlm = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
      default:
        if (!arg.startsWith("-")) positional.push(arg);
    }
  }

  const keyword = positional.join(" ").trim() || null;
  return {
    keyword,
    input: {
      keyword: keyword ?? "",
      daysBack,
      maxResults,
      regionCode,
      language,
    },
    outputDir,
    skipLlm,
  };
}

async function main(): Promise<void> {
  const { keyword, input, outputDir, skipLlm } = parseArgs(
    process.argv.slice(2)
  );

  if (!keyword) {
    printUsage();
    process.exit(1);
  }

  try {
    await runOrchestrator({ input, outputDir, skipLlm });
  } catch (err) {
    console.error("[오류]", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
