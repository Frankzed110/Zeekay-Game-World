// SaveProvider: device-first save with automatic cloud sync (anonymous player key).
// - Local write on every change.
// - Cloud push debounced 5s, plus on app background and on demand (results / "Sync now").
// - On start: pull cloud save and merge by updated_at (newer wins).

import { useMutation, useQuery } from "@tanstack/react-query";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

import { api } from "@/src/api/client";
import { audio } from "@/src/game/audio";
import { secureStorage, storage } from "@/src/utils/storage";

import { defaultSave, normalizeSave, pickNewer, type SaveData } from "./progression";

const SAVE_KEY = "zgw_save_v1";
const PLAYER_KEY = "player_key";
const PUSH_DEBOUNCE_MS = 5000;

export type SyncStatus = "local" | "syncing" | "synced" | "offline";

interface SaveContextValue {
  save: SaveData;
  ready: boolean;
  playerKey: string | null;
  update: (mutator: (draft: SaveData) => void) => void;
  replace: (next: SaveData) => void;
  syncStatus: SyncStatus;
  lastSynced: string | null;
  syncNow: () => void;
}

const SaveContext = createContext<SaveContextValue | null>(null);

function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const defaultDisplayName = (key: string) => `Archer-${key.replace(/-/g, "").slice(-4).toUpperCase()}`;

export function SaveProvider({ children }: { children: React.ReactNode }) {
  const [save, setSave] = useState<SaveData>(() => defaultSave());
  const [ready, setReady] = useState(false);
  const [playerKey, setPlayerKey] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const saveRef = useRef(save);
  const mergedCloud = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  // Boot: player key + local save
  useEffect(() => {
    let alive = true;
    (async () => {
      let key = await secureStorage.getItem<string | null>(PLAYER_KEY, null);
      if (!key) {
        key = uuid();
        await secureStorage.setItem(PLAYER_KEY, key);
      }
      const raw = await storage.getItem<unknown>(SAVE_KEY, null);
      const local = raw ? normalizeSave(raw) : defaultSave(defaultDisplayName(key));
      if (!alive) return;
      saveRef.current = local;
      setSave(local);
      setPlayerKey(key);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const backend = api.hasBackend();

  const register = useMutation({
    mutationFn: ({ key, name }: { key: string; name: string }) => api.registerPlayer(key, name),
  });

  const pull = useQuery({
    queryKey: ["cloudSave", playerKey],
    queryFn: () => api.pullSave(playerKey as string),
    enabled: ready && !!playerKey && backend,
    staleTime: Infinity,
  });

  const push = useMutation({
    mutationFn: (s: SaveData) => api.pushSave(playerKey as string, s, s.updated_at, s.profile.name),
    onMutate: () => setSyncStatus("syncing"),
    onSuccess: (res) => {
      dirty.current = false;
      setSyncStatus("synced");
      setLastSynced(res.synced_at);
    },
    onError: () => setSyncStatus("offline"),
  });
  const pushRef = useRef(push.mutate);
  pushRef.current = push.mutate;

  // Register once we have a key
  const registerMutate = register.mutate;
  useEffect(() => {
    if (ready && playerKey && backend) registerMutate({ key: playerKey, name: saveRef.current.profile.name });
  }, [ready, playerKey, backend, registerMutate]);

  // Merge cloud save once (newer wins)
  useEffect(() => {
    if (mergedCloud.current) return;
    if (pull.isError) {
      mergedCloud.current = true;
      setSyncStatus("offline");
      return;
    }
    if (!pull.data) return;
    mergedCloud.current = true;
    const remote = pull.data.found ? normalizeSave(pull.data.payload) : null;
    const winner = pickNewer(saveRef.current, remote);
    if (winner !== saveRef.current) {
      saveRef.current = winner;
      setSave(winner);
      storage.setItem(SAVE_KEY, winner);
      setSyncStatus("synced");
    } else if (playerKey) {
      pushRef.current(saveRef.current); // local is newer (or cloud empty) → push
    }
  }, [pull.data, pull.isError, playerKey]);

  const flush = useCallback(() => {
    if (pushTimer.current) {
      clearTimeout(pushTimer.current);
      pushTimer.current = null;
    }
    if (backend && playerKey && dirty.current) pushRef.current(saveRef.current);
  }, [backend, playerKey]);

  const schedulePush = useCallback(() => {
    dirty.current = true;
    if (!backend) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(flush, PUSH_DEBOUNCE_MS);
  }, [backend, flush]);

  // Push when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st !== "active") flush();
    });
    return () => sub.remove();
  }, [flush]);

  // Keep audio toggles in sync
  useEffect(() => {
    audio.setMusicEnabled(save.settings.music);
    audio.setSfxEnabled(save.settings.sfx);
  }, [save.settings.music, save.settings.sfx]);

  const commit = useCallback(
    (next: SaveData) => {
      saveRef.current = next;
      setSave(next);
      storage.setItem(SAVE_KEY, next);
      schedulePush();
    },
    [schedulePush],
  );

  const update = useCallback(
    (mutator: (draft: SaveData) => void) => {
      const draft = JSON.parse(JSON.stringify(saveRef.current)) as SaveData;
      mutator(draft);
      draft.updated_at = new Date().toISOString();
      commit(draft);
    },
    [commit],
  );

  const replace = useCallback(
    (next: SaveData) => {
      commit({ ...next, updated_at: next.updated_at || new Date().toISOString() });
    },
    [commit],
  );

  const syncNow = useCallback(() => {
    dirty.current = true;
    flush();
  }, [flush]);

  const value = useMemo<SaveContextValue>(
    () => ({ save, ready, playerKey, update, replace, syncStatus: backend ? syncStatus : "local", lastSynced, syncNow }),
    [save, ready, playerKey, update, replace, syncStatus, lastSynced, syncNow, backend],
  );

  return <SaveContext.Provider value={value}>{children}</SaveContext.Provider>;
}

export function useSave(): SaveContextValue {
  const ctx = useContext(SaveContext);
  if (!ctx) throw new Error("useSave must be used inside <SaveProvider>");
  return ctx;
}
