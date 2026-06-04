import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runOrchestrator } from "./agents/orchestrator.js";
import type { ResearchInput } from "./types.js";

const PORT = Number(process.env.PORT ?? 5151);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, "public");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function serveStatic(
  urlPath: string,
  res: ServerResponse
): Promise<boolean> {
  const safe = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(PUBLIC_DIR, safe === "/" ? "index.html" : safe);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return true;
  }

  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

function parseResearchBody(raw: string): {
  input: ResearchInput;
  skipLlm: boolean;
} | { error: string } {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { error: "JSON 파싱 실패" };
  }

  const keyword = String(body.keyword ?? "").trim();
  if (!keyword) return { error: "keyword는 필수입니다." };

  return {
    input: {
      keyword,
      daysBack: Math.max(1, Number(body.daysBack ?? 7)),
      maxResults: Math.min(Math.max(5, Number(body.maxResults ?? 25)), 50),
      regionCode: String(body.regionCode ?? "KR"),
      language: String(body.language ?? "ko"),
    },
    skipLlm: Boolean(body.skipLlm),
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      youtube: Boolean(process.env.YOUTUBE_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/research") {
    const raw = await readBody(req);
    const parsed = parseResearchBody(raw);
    if ("error" in parsed) {
      sendJson(res, 400, { error: parsed.error });
      return;
    }

    if (!process.env.YOUTUBE_API_KEY) {
      sendJson(res, 500, { error: "YOUTUBE_API_KEY가 .env에 없습니다." });
      return;
    }
    if (!parsed.skipLlm && !process.env.OPENAI_API_KEY) {
      sendJson(res, 500, { error: "OPENAI_API_KEY가 .env에 없습니다." });
      return;
    }

    try {
      const output = await runOrchestrator({
        input: parsed.input,
        skipLlm: parsed.skipLlm,
        writeReports: true,
        outputDir: path.join(ROOT, "reports"),
      });

      sendJson(res, 200, {
        markdown: output.markdown,
        analysis: output.analysis,
        result: output.result,
        paths: {
          markdown: output.markdownPath,
          json: output.jsonPath,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: message });
    }
    return;
  }

  if (req.method === "GET") {
    const staticPath =
      pathname === "/" ? "/index.html" : pathname;
    const served = await serveStatic(staticPath, res);
    if (served) return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not Found");
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: "Internal Server Error" });
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`YouTube Trend Agent → http://127.0.0.1:${PORT}`);
});
