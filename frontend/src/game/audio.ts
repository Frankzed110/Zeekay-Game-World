// Audio singleton over expo-audio: one looping music player per theme (crossfaded) and a
// pre-created player per SFX. Respects the music / sfx toggles in the save.

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

import type { EngineEventType, KingdomId, MusicId } from "./types";

const MUSIC: Record<MusicId, number> = {
  forest: require("@/assets/audio/music_forest.wav"),
  ember: require("@/assets/audio/music_ember.wav"),
  frost: require("@/assets/audio/music_frost.wav"),
  isles: require("@/assets/audio/music_isles.wav"),
  title: require("@/assets/audio/music_title.wav"),
  boss: require("@/assets/audio/music_boss.wav"),
};

export type SfxId =
  | "draw"
  | "release"
  | "hit"
  | "crit"
  | "thud"
  | "explosion"
  | "pickup"
  | "ui"
  | "blocked"
  | "hurt"
  | "victory"
  | "defeat"
  | "levelup";

const SFX: Record<SfxId, number> = {
  draw: require("@/assets/audio/sfx_draw.wav"),
  release: require("@/assets/audio/sfx_release.wav"),
  hit: require("@/assets/audio/sfx_hit.wav"),
  crit: require("@/assets/audio/sfx_crit.wav"),
  thud: require("@/assets/audio/sfx_thud.wav"),
  explosion: require("@/assets/audio/sfx_explosion.wav"),
  pickup: require("@/assets/audio/sfx_pickup.wav"),
  ui: require("@/assets/audio/sfx_ui.wav"),
  blocked: require("@/assets/audio/sfx_blocked.wav"),
  hurt: require("@/assets/audio/sfx_hurt.wav"),
  victory: require("@/assets/audio/sfx_victory.wav"),
  defeat: require("@/assets/audio/sfx_defeat.wav"),
  levelup: require("@/assets/audio/sfx_levelup.wav"),
};

const SFX_VOLUME: Partial<Record<SfxId, number>> = { draw: 0.5, ui: 0.6, hit: 0.8, release: 0.8 };
const MUSIC_VOLUME = 0.45;

/** Map engine events to SFX. */
export const EVENT_SFX: Partial<Record<EngineEventType, SfxId>> = {
  draw: "draw",
  release: "release",
  hit: "hit",
  crit: "crit",
  thud: "thud",
  explosion: "explosion",
  free: "pickup",
  pickup: "pickup",
  hurt: "hurt",
  blocked: "blocked",
  victory: "victory",
  defeat: "defeat",
  levelup: "levelup",
  wave: "ui",
  ability: "ui",
};

export const KINGDOM_MUSIC: Record<KingdomId, MusicId> = { vale: "forest", ember: "ember", frost: "frost", isles: "isles" };

class AudioManager {
  private music = new Map<MusicId, AudioPlayer>();
  private sfx = new Map<SfxId, AudioPlayer>();
  private current: MusicId | null = null;
  private wanted: MusicId | null = null;
  private musicOn = true;
  private sfxOn = true;
  private ready = false;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private lastPlayed = new Map<SfxId, number>();

  init() {
    if (this.ready) return;
    this.ready = true;
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "doNotMix" }).catch(() => {});
    try {
      (Object.keys(SFX) as SfxId[]).forEach((id) => {
        const p = createAudioPlayer(SFX[id]);
        p.volume = SFX_VOLUME[id] ?? 1;
        this.sfx.set(id, p);
      });
    } catch {
      // audio unavailable (e.g. headless) — stay silent
    }
  }

  private player(id: MusicId): AudioPlayer | null {
    let p = this.music.get(id);
    if (!p) {
      try {
        p = createAudioPlayer(MUSIC[id]);
        p.loop = true;
        p.volume = 0;
        this.music.set(id, p);
      } catch {
        return null;
      }
    }
    return p;
  }

  setMusicEnabled(on: boolean) {
    this.musicOn = on;
    if (!on) {
      this.music.forEach((p) => {
        try {
          p.pause();
        } catch {}
      });
      this.current = null;
    } else if (this.wanted) {
      const w = this.wanted;
      this.wanted = null;
      this.playMusic(w);
    }
  }

  setSfxEnabled(on: boolean) {
    this.sfxOn = on;
  }

  /** Crossfade to a theme. Safe to call repeatedly. */
  playMusic(id: MusicId) {
    this.init();
    if (this.wanted === id && this.current === id) return;
    this.wanted = id;
    if (!this.musicOn) return;
    const next = this.player(id);
    if (!next) return;
    const prev = this.current && this.current !== id ? this.music.get(this.current) ?? null : null;
    this.current = id;
    try {
      next.play();
    } catch {}
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    let k = 0;
    this.fadeTimer = setInterval(() => {
      k += 0.1;
      try {
        next.volume = Math.min(MUSIC_VOLUME, MUSIC_VOLUME * k);
        if (prev) prev.volume = Math.max(0, MUSIC_VOLUME * (1 - k));
      } catch {}
      if (k >= 1) {
        if (this.fadeTimer) clearInterval(this.fadeTimer);
        this.fadeTimer = null;
        try {
          prev?.pause();
        } catch {}
      }
    }, 60);
  }

  /** Browsers block audio until a user gesture: call from any press handler. */
  unlock() {
    this.init();
    if (this.musicOn && this.current) {
      const p = this.music.get(this.current);
      try {
        if (p && !p.playing) p.play();
      } catch {}
    }
  }

  play(id: SfxId) {
    if (!this.sfxOn) return;
    this.init();
    const now = Date.now();
    if (now - (this.lastPlayed.get(id) ?? 0) < 45) return; // throttle stacking
    this.lastPlayed.set(id, now);
    const p = this.sfx.get(id);
    if (!p) return;
    try {
      p.seekTo(0)
        .then(() => p.play())
        .catch(() => {});
    } catch {}
  }

  playEvent(type: EngineEventType) {
    const id = EVENT_SFX[type];
    if (id) this.play(id);
  }
}

export const audio = new AudioManager();
