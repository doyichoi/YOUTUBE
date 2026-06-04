import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const SESSION_COOKIE = "yt_trend_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

interface Session {
  email: string;
  role: "admin";
  expiresAt: number;
}

const sessions = new Map<string, Session>();

function adminEmail(): string {
  return process.env.ADMIN_EMAIL ?? "naebon1@gmail.com";
}

function adminPassword(): string | undefined {
  return process.env.ADMIN_PASSWORD;
}

function sessionSecret(): string {
  return process.env.SESSION_SECRET ?? "dev-change-me-in-production";
}

function hashToken(token: string): string {
  return createHash("sha256").update(`${sessionSecret()}:${token}`).digest("hex");
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie ?? "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k) out[k] = decodeURIComponent(rest.join("="));
  }
  return out;
}

export function getSession(req: IncomingMessage): Session | null {
  const raw = parseCookies(req)[SESSION_COOKIE];
  if (!raw) return null;
  const session = sessions.get(hashToken(raw));
  if (!session || session.expiresAt < Date.now()) {
    if (raw) sessions.delete(hashToken(raw));
    return null;
  }
  return session;
}

export function isAdmin(req: IncomingMessage): boolean {
  return getSession(req)?.role === "admin";
}

function setSessionCookie(res: ServerResponse, token: string): void {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`
  );
}

export function clearSessionCookie(res: ServerResponse): void {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

export function login(
  email: string,
  password: string
): { ok: true; token: string } | { ok: false; error: string } {
  const expectedEmail = adminEmail().toLowerCase();
  const expectedPassword = adminPassword();

  if (!expectedPassword) {
    return { ok: false, error: "ADMIN_PASSWORD가 서버 .env에 설정되지 않았습니다." };
  }

  if (email.trim().toLowerCase() !== expectedEmail) {
    return { ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  const a = Buffer.from(password);
  const b = Buffer.from(expectedPassword);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  const token = randomBytes(32).toString("hex");
  sessions.set(hashToken(token), {
    email: expectedEmail,
    role: "admin",
    expiresAt: Date.now() + SESSION_MS,
  });

  return { ok: true, token };
}

export function attachSession(res: ServerResponse, token: string): void {
  setSessionCookie(res, token);
}

export function logout(req: IncomingMessage, res: ServerResponse): void {
  const raw = parseCookies(req)[SESSION_COOKIE];
  if (raw) sessions.delete(hashToken(raw));
  clearSessionCookie(res);
}

export function authPayload(req: IncomingMessage): {
  role: "admin" | "reader";
  email: string | null;
} {
  const session = getSession(req);
  if (session) return { role: "admin", email: session.email };
  return { role: "reader", email: null };
}
