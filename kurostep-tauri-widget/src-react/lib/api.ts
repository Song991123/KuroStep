export const DEPLOYED_API_BASE_URL = "https://54-116-185-226.sslip.io";

const isGitHubPages = window.location.hostname.endsWith("github.io");
const isTauriApp =
  Boolean(window.__TAURI__) ||
  window.location.protocol === "tauri:" ||
  window.location.hostname === "tauri.localhost";

export const API_BASE_URL =
  window.localStorage.getItem("kurostep.apiBaseUrl") ||
  (isGitHubPages || isTauriApp ? DEPLOYED_API_BASE_URL : "http://localhost:8080");

import type { AuthUser } from "../types";

export function readJson<T>(key: string, fallback: T | null = null): T | null {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function removeStorage(key: string) {
  window.localStorage.removeItem(key);
}

export async function api<T = any>(path: string, options: RequestInit = {}, auth = readJson<AuthUser>("kurostep.auth")): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers || {}) as Record<string, string>),
  };

  if (auth?.accessToken) {
    headers.Authorization = `Bearer ${auth.accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `${response.status} ${response.statusText}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function authErrorMessage(error: unknown, mode: "login" | "signup") {
  if (!(error instanceof Error)) {
    return `${mode === "signup" ? "회원가입" : "로그인"}에 실패했다냥: ${String(error)}`;
  }
  const message = error?.message || String(error);
  const lower = message.toLowerCase();

  if (message.includes("401") || lower.includes("unauthorized")) {
    return "이메일이나 비밀번호가 안 맞다냥.";
  }
  if (message.includes("409") || lower.includes("duplicate") || lower.includes("exists")) {
    return "이미 가입된 이메일이다냥. 로그인으로 들어와줘냥.";
  }
  if (message.includes("400") || lower.includes("validation")) {
    return mode === "signup" ? "입력한 가입 정보를 다시 확인해줘냥." : "이메일과 비밀번호를 다시 확인해줘냥.";
  }

  return `${mode === "signup" ? "회원가입" : "로그인"}에 실패했다냥: ${message}`;
}
