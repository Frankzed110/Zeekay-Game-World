// Game-content colors: biome identities and element colors.
// These are CONTENT constants (identical across UI themes), so hex literals live here by design.

import type { AllyType, BiomeId, Element, EnemyKind } from "./types";

export interface BiomePalette {
  name: string;
  skyTop: string;
  skyMid: string;
  skyBottom: string;
  sun: string;
  sunGlow: string;
  sunY: number; // 0..1 of world height
  far: string;
  mid: string;
  near: string;
  ground: string;
  groundTop: string;
  crust: string; // grass / snow / ash strip
  prop: string; // tree / ruin silhouettes
  propAccent: string;
  fog: string;
  ambient: "leaf" | "ember" | "snow" | "drop" | "dust";
  accent: string;
  /** Banner gradient used by the story map. */
  banner: [string, string];
}

export const BIOMES: Record<BiomeId, BiomePalette> = {
  vale: {
    name: "Emerald Vale",
    skyTop: "#0F2B2E",
    skyMid: "#2F6B5A",
    skyBottom: "#F0D48A",
    sun: "#FFF1BF",
    sunGlow: "rgba(255,224,140,0.35)",
    sunY: 0.32,
    far: "#2D5F55",
    mid: "#22493B",
    near: "#173528",
    ground: "#1D3A1F",
    groundTop: "#3F7A2E",
    crust: "#7CC653",
    prop: "#12291C",
    propAccent: "#2E6B3A",
    fog: "rgba(240,212,138,0.10)",
    ambient: "leaf",
    accent: "#E3B341",
    banner: ["#1F5A44", "#C9A24A"],
  },
  ember: {
    name: "Emberpeak",
    skyTop: "#12090A",
    skyMid: "#4A1A12",
    skyBottom: "#E0662F",
    sun: "#FFB070",
    sunGlow: "rgba(255,110,50,0.35)",
    sunY: 0.38,
    far: "#3A1C18",
    mid: "#2A1512",
    near: "#1B0E0C",
    ground: "#1E1716",
    groundTop: "#3A2A26",
    crust: "#FF6A2B",
    prop: "#140C0B",
    propAccent: "#FF5A1F",
    fog: "rgba(255,90,30,0.10)",
    ambient: "ember",
    accent: "#FF7A33",
    banner: ["#3A1410", "#E05A36"],
  },
  frost: {
    name: "Frost Reach",
    skyTop: "#0D1B2E",
    skyMid: "#3F6A93",
    skyBottom: "#CFE7F5",
    sun: "#FFFFFF",
    sunGlow: "rgba(200,235,255,0.35)",
    sunY: 0.28,
    far: "#6E92B3",
    mid: "#4D7091",
    near: "#33506D",
    ground: "#5C7891",
    groundTop: "#BFD9EA",
    crust: "#F4FBFF",
    prop: "#27405A",
    propAccent: "#9CC9E8",
    fog: "rgba(230,245,255,0.14)",
    ambient: "snow",
    accent: "#8FD3FF",
    banner: ["#1F3B5C", "#9CC9E8"],
  },
  isles: {
    name: "Sunken Isles",
    skyTop: "#081F2B",
    skyMid: "#156B73",
    skyBottom: "#F2C46B",
    sun: "#FFE29A",
    sunGlow: "rgba(255,210,120,0.32)",
    sunY: 0.36,
    far: "#1E6F72",
    mid: "#14555A",
    near: "#0D3D42",
    ground: "#4E4430",
    groundTop: "#C9A75E",
    crust: "#3DBFA8",
    prop: "#0B2F33",
    propAccent: "#D9B45A",
    fog: "rgba(61,191,168,0.10)",
    ambient: "drop",
    accent: "#3DBFA8",
    banner: ["#0F4F55", "#D9B45A"],
  },
  arena: {
    name: "Arena of Ardenfall",
    skyTop: "#140F1F",
    skyMid: "#4A2C4F",
    skyBottom: "#E89A5C",
    sun: "#FFD39A",
    sunGlow: "rgba(255,170,100,0.30)",
    sunY: 0.4,
    far: "#3B2A40",
    mid: "#2C2033",
    near: "#211827",
    ground: "#3A2E26",
    groundTop: "#B08C5E",
    crust: "#D9B07A",
    prop: "#1A1320",
    propAccent: "#E05A36",
    fog: "rgba(232,154,92,0.08)",
    ambient: "dust",
    accent: "#E05A36",
    banner: ["#2C1A33", "#E05A36"],
  },
  yard: {
    name: "Training Yard",
    skyTop: "#13263A",
    skyMid: "#3E7AA6",
    skyBottom: "#F3DFA8",
    sun: "#FFF6D5",
    sunGlow: "rgba(255,240,190,0.30)",
    sunY: 0.3,
    far: "#4E7F86",
    mid: "#3B6A5B",
    near: "#2B5040",
    ground: "#3B4A2A",
    groundTop: "#8DB060",
    crust: "#A8D16B",
    prop: "#20382A",
    propAccent: "#D48B32",
    fog: "rgba(255,240,190,0.08)",
    ambient: "leaf",
    accent: "#D48B32",
    banner: ["#23465A", "#D48B32"],
  },
};

export const ELEMENT_COLORS: Record<Element, string> = {
  normal: "#E9E2D0",
  fire: "#FF6A2B",
  ice: "#8FD3FF",
  storm: "#C8A8FF",
  toxin: "#7EE05A",
};

export const ELEMENT_GLOW: Record<Element, string> = {
  normal: "rgba(255,255,255,0.0)",
  fire: "rgba(255,106,43,0.55)",
  ice: "rgba(143,211,255,0.55)",
  storm: "rgba(200,168,255,0.6)",
  toxin: "rgba(126,224,90,0.55)",
};

export const TEAM_COLORS = {
  player: { body: "#2F7D5B", trim: "#E3B341", skin: "#E8B48A", hair: "#5A2E1B" },
  escort: { body: "#7A5BA6", trim: "#F2E6C9", skin: "#D9A27A", hair: "#DDDDDD" },
  hostage: { body: "#C9B48A", trim: "#7A6A4A", skin: "#E0AE84", hair: "#3A2A1A" },
};

export const ALLY_COLORS: Record<AllyType, { body: string; trim: string }> = {
  scout: { body: "#3A8FB7", trim: "#D9F0FF" },
  marksman: { body: "#5B6E3A", trim: "#E3D27A" },
  tank: { body: "#6B6F7A", trim: "#E05A36" },
};

export const ENEMY_COLORS: Record<Exclude<EnemyKind, "boss">, { body: string; trim: string }> = {
  grunt: { body: "#5A2A2A", trim: "#C94A3A" },
  archer: { body: "#3E2F4F", trim: "#B38BE0" },
  shield: { body: "#4A4F5A", trim: "#C9CED9" },
  shaman: { body: "#2F4A3A", trim: "#7EE05A" },
  champion: { body: "#2A2233", trim: "#F2C46B" },
  dummy: { body: "#8A6A44", trim: "#D9C08A" },
};

export const FX = {
  gold: "#F2C94C",
  heal: "#6EE7A0",
  damage: "#FFFFFF",
  crit: "#FFD24A",
  hurt: "#FF6B6B",
  block: "#C9CED9",
  shadow: "rgba(0,0,0,0.28)",
  vignette: "rgba(0,0,0,0.55)",
  telegraph: "rgba(255,70,50,0.35)",
  telegraphEdge: "rgba(255,120,90,0.9)",
  lightning: "#E8DDFF",
  geyser: "#FF8A3D",
  icicle: "#DFF3FF",
  wood: "#7A5230",
  woodDark: "#4E3220",
  metal: "#8C93A3",
  rope: "#C9A86A",
  bowString: "#F4F0E6",
  arrowShaft: "#D9C49A",
  trajectory: "rgba(255,255,255,0.75)",
};
