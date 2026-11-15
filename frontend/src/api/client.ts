// Typed API helpers over EXPO_PUBLIC_BACKEND_URL + /api.
import type { ScoreMode } from "@/src/game/types";

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!BASE) throw new ApiError(0, "EXPO_PUBLIC_BACKEND_URL is not set");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`${BASE}/api${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, e instanceof Error ? e.message : "Network error");
  } finally {
    clearTimeout(timer);
  }
}

export interface LeaderEntry {
  player_key: string;
  display_name: string;
  score: number;
  rank: number;
  wave?: number;
  difficulty?: string;
  arena_id?: string;
}

export interface HallEntry extends LeaderEntry {
  modes: ScoreMode[];
}

export interface ChampionsResponse {
  by_mode: Record<ScoreMode, LeaderEntry[]>;
  hall: HallEntry[];
}

export interface ScoreSubmit {
  player_key: string;
  display_name: string;
  mode: ScoreMode;
  arena_id: string;
  score: number;
  wave: number;
  difficulty: string;
  meta?: Record<string, unknown>;
}

export const api = {
  hasBackend: () => !!BASE,
  registerPlayer: (player_key: string, display_name: string) =>
    request<{ ok: boolean }>("/players/register", { method: "POST", body: JSON.stringify({ player_key, display_name }) }),
  pushSave: (player_key: string, payload: unknown, updated_at: string, display_name?: string) =>
    request<{ ok: boolean; synced_at: string }>("/save", { method: "POST", body: JSON.stringify({ player_key, payload, updated_at, display_name }) }),
  pullSave: (player_key: string) =>
    request<{ found: boolean; payload: unknown; updated_at: string | null }>(`/save/${encodeURIComponent(player_key)}`),
  submitScore: (s: ScoreSubmit) =>
    request<{ ok: boolean; rank: number; best: number }>("/scores", { method: "POST", body: JSON.stringify({ meta: {}, ...s }) }),
  leaderboard: (mode: ScoreMode, limit = 50) =>
    request<{ mode: string; entries: LeaderEntry[] }>(`/leaderboard?mode=${mode}&limit=${limit}`),
  champions: () => request<ChampionsResponse>("/champions"),
};
