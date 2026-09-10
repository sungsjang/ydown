import { createHash, createHmac, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";

const COOKIE_NAME = "ydown_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyPassword(password: string): boolean {
  const encoded = serverEnv().adminPasswordHash;
  const [scheme, iterationsText, saltText, digestText] = encoded.split(":");
  if (scheme !== "pbkdf2_sha256" || !iterationsText || !saltText || !digestText) return false;
  const iterations = Number(iterationsText);
  if (!Number.isSafeInteger(iterations) || iterations < 100_000) return false;
  const digest = pbkdf2Sync(password, Buffer.from(saltText, "base64url"), iterations, 32, "sha256").toString("base64url");
  return safeEqual(digest, digestText);
}

function sign(payload: string): string {
  return createHmac("sha256", serverEnv().sessionSecret).update(payload).digest("base64url");
}

export function createSessionToken(): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(sign(payload), signature)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
    return typeof decoded.exp === "number" && decoded.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

export async function isSignedIn(): Promise<boolean> {
  return verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
}

export async function setSessionCookie() {
  (await cookies()).set(COOKIE_NAME, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function clearSessionCookie() {
  (await cookies()).set(COOKIE_NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
}

export function isAgentAuthorized(request: Request): boolean {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return false;
  const tokenHash = createHash("sha256").update(authorization.slice(7)).digest("hex");
  return safeEqual(tokenHash, serverEnv().agentTokenHash.toLowerCase());
}
