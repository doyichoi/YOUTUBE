import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  attachSession,
  authPayload,
  isAdmin,
  login,
  logout,
} from "./auth.js";
import { runOrchestrator } from "./agents/orchestrator.js";
import {
  buildGlobalInsights,
  getReport,
  listReports,
} from "./reportsStore.js";
import type { ResearchInput } from "./types.js";

const PORT = Number(process.env.PORT ?? 5151);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const REPORTS_DIR = path.join(ROOT, "reports");

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

function requireAdmin(
  req: IncomingMessage,
  res: ServerResponse
): boolean {
  if (isAdmin(req)) return true;
  sendJson(res, 401, { error: "관리자 로그인이 필요합니다." });
  return false;
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
      adminConfigured: Boolean(process.env.ADMIN_PASSWORD),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/auth/me") {
    sendJson(res, 200, authPayload(req));
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    let body: { email?: string; password?: string };
    try {
      body = JSON.parse(await readBody(req)) as { email?: string; password?: string };
    } catch {
      sendJson(res, 400, { error: "JSON 파싱 실패" });
      return;
    }
    const result = login(String(body.email ?? ""), String(body.password ?? ""));
    if (!result.ok) {
      sendJson(res, 401, { error: result.error });
      return;
    }
    attachSession(res, result.token);
    sendJson(res, 200, { role: "admin", email: process.env.ADMIN_EMAIL ?? "naebon1@gmail.com" });
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/logout") {
    logout(req, res);
    sendJson(res, 200, { role: "reader", email: null });
    return;
  }

  if (req.method === "GET" && pathname === "/api/insights") {
    const reports = await listReports(REPORTS_DIR);
    sendJson(res, 200, buildGlobalInsights(reports));
    return;
  }

  if (req.method === "GET" && pathname === "/api/reports") {
    const reports = await listReports(REPORTS_DIR);
    sendJson(
      res,
      200,
      reports.map((r) => ({
        id: r.id,
        keyword: r.keyword,
        generatedAt: r.generatedAt,
        excerpt: r.excerpt,
        coverThumbnail: r.coverThumbnail,
        topVideoCount: r.top10.length,
        regionCode: r.input.regionCode,
      }))
    );
    return;
  }

  const reportMatch = pathname.match(/^\/api\/reports\/([^/]+)$/);
  if (req.method === "GET" && reportMatch) {
    const report = await getReport(REPORTS_DIR, decodeURIComponent(reportMatch[1]));
    if (!report) {
      sendJson(res, 404, { error: "리포트를 찾을 수 없습니다." });
      return;
    }
    sendJson(res, 200, report);
    return;
  }

  if (req.method === "POST" && pathname === "/api/research") {
    if (!requireAdmin(req, res)) return;

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
        outputDir: REPORTS_DIR,
      });

      const report = await getReport(
        REPORTS_DIR,
        path.basename(output.jsonPath ?? "", ".json")
      );

      sendJson(res, 200, {
        markdown: output.markdown,
        analysis: output.analysis,
        result: output.result,
        report,
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
    const staticPath = pathname === "/" ? "/index.html" : pathname;
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
  console.log(`YouTube Trend Magazine → http://127.0.0.1:${PORT}`);
});
