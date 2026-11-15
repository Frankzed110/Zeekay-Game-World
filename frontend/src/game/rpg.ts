// RPG data + pure progression math: classes, attributes, bows, armor, elements,
// abilities, crafting recipes, mastery ranks and XP curve.

import type {
  AbilityId,
  AllyType,
  ClassId,
  Difficulty,
  DrillId,
  Element,
  MaterialId,
  PlayerLoadout,
} from "./types";

// ---------------------------------------------------------------------------
// Classes

export interface ClassDef {
  id: ClassId;
  name: string;
  tagline: string;
  signature: AbilityId;
  hpMul: number;
  drawMul: number;
  critBonus: number;
  allyDmgBonus: number;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  ranger: {
    id: "ranger",
    name: "Ranger",
    tagline: "Balanced. Multishot recharges 30% faster.",
    signature: "multishot",
    hpMul: 1,
    drawMul: 1,
    critBonus: 0,
    allyDmgBonus: 0,
  },
  stalker: {
    id: "stalker",
    name: "Stalker",
    tagline: "Faster draw, sharper crits. Focus adds +25% crit.",
    signature: "focus",
    hpMul: 0.95,
    drawMul: 1.2,
    critBonus: 0.1,
    allyDmgBonus: 0,
  },
  warden: {
    id: "warden",
    name: "Warden",
    tagline: "Sturdy protector. Allies hit harder; Warcry heals 40% and taunts.",
    signature: "warcry",
    hpMul: 1.3,
    drawMul: 0.95,
    critBonus: 0,
    allyDmgBonus: 0.15,
  },
};

export const CLASS_IDS: ClassId[] = ["ranger", "stalker", "warden"];

// ---------------------------------------------------------------------------
// Attributes

export type AttrId = "power" | "precision" | "agility" | "vitality";
export type Attrs = Record<AttrId, number>;

export const ATTRS: { id: AttrId; name: string; effect: string }[] = [
  { id: "power", name: "Power", effect: "+4% arrow damage, harder knockback" },
  { id: "precision", name: "Precision", effect: "Steadier aim, +1% crit chance" },
  { id: "agility", name: "Agility", effect: "+4% draw speed, +2% move speed" },
  { id: "vitality", name: "Vitality", effect: "+12 max HP" },
];

export const ATTR_POINTS_PER_LEVEL = 3;
export const MAX_LEVEL = 30;

// ---------------------------------------------------------------------------
// Materials

export const MATERIALS: { id: MaterialId; name: string; kingdom: string; color: string }[] = [
  { id: "oakwood", name: "Oakwood", kingdom: "Emerald Vale", color: "#B07A42" },
  { id: "emberstone", name: "Emberstone", kingdom: "Emberpeak", color: "#FF6A2B" },
  { id: "frostiron", name: "Frostiron", kingdom: "Frost Reach", color: "#8FD3FF" },
  { id: "tidepearl", name: "Tidepearl", kingdom: "Sunken Isles", color: "#3DBFA8" },
];

export type Cost = { gold: number; materials?: Partial<Record<MaterialId, number>>; level?: number };

// ---------------------------------------------------------------------------
// Bows

export interface BowDef {
  id: string;
  name: string;
  damage: number;
  drawSpeed: number;
  range: number; // arrow speed multiplier
  critBonus: number;
  pierce: number;
  multishotBonus: number;
  windResist: number;
  special: string;
  source: "start" | "shop" | "craft";
  cost: Cost;
}

export const BOWS: BowDef[] = [
  { id: "hunter_shortbow", name: "Hunter Shortbow", damage: 22, drawSpeed: 1.15, range: 0.9, critBonus: 0.02, pierce: 0, multishotBonus: 0, windResist: 0, special: "Quick and light", source: "start", cost: { gold: 0 } },
  { id: "yew_warbow", name: "Yew Warbow", damage: 30, drawSpeed: 1.0, range: 0.97, critBonus: 0.03, pierce: 0, multishotBonus: 0, windResist: 0, special: "Reliable heft", source: "shop", cost: { gold: 250 } },
  { id: "rangers_recurve", name: "Ranger's Recurve", damage: 34, drawSpeed: 1.1, range: 1.0, critBonus: 0.06, pierce: 0, multishotBonus: 0, windResist: 0.1, special: "Balanced recurve", source: "shop", cost: { gold: 600, level: 3 } },
  { id: "windpiercer", name: "Windpiercer", damage: 38, drawSpeed: 1.05, range: 1.1, critBonus: 0.08, pierce: 1, multishotBonus: 0, windResist: 0.4, special: "Ignores 40% wind · pierce 1", source: "shop", cost: { gold: 1200, level: 5 } },
  { id: "emberlash", name: "Emberlash", damage: 44, drawSpeed: 0.95, range: 1.0, critBonus: 0.05, pierce: 0, multishotBonus: 0, windResist: 0.1, special: "Forged in Emberpeak", source: "craft", cost: { gold: 400, materials: { emberstone: 4, oakwood: 3 } } },
  { id: "frostbite_longbow", name: "Frostbite Longbow", damage: 50, drawSpeed: 0.85, range: 1.15, critBonus: 0.1, pierce: 1, multishotBonus: 0, windResist: 0.2, special: "Long reach · pierce 1", source: "craft", cost: { gold: 600, materials: { frostiron: 4, emberstone: 2 } } },
  { id: "tidecaller", name: "Tidecaller", damage: 48, drawSpeed: 1.05, range: 1.05, critBonus: 0.08, pierce: 0, multishotBonus: 2, windResist: 0.2, special: "Multishot +2 arrows", source: "craft", cost: { gold: 800, materials: { tidepearl: 4, frostiron: 2 } } },
  { id: "stormrend", name: "Stormrend", damage: 62, drawSpeed: 1.0, range: 1.15, critBonus: 0.15, pierce: 2, multishotBonus: 2, windResist: 0.3, special: "Legendary · pierce 2 · multishot +2", source: "craft", cost: { gold: 1500, materials: { oakwood: 3, emberstone: 3, frostiron: 3, tidepearl: 3 } } },
];

// ---------------------------------------------------------------------------
// Armor

export interface ArmorDef {
  id: string;
  name: string;
  hp: number;
  moveSpeed: number;
  regen: number;
  burnImmune: boolean;
  slowImmune: boolean;
  special: string;
  source: "start" | "shop" | "craft";
  cost: Cost;
}

export const ARMORS: ArmorDef[] = [
  { id: "travelers_garb", name: "Traveler's Garb", hp: 0, moveSpeed: 1.0, regen: 0, burnImmune: false, slowImmune: false, special: "Simple and light", source: "start", cost: { gold: 0 } },
  { id: "scout_leathers", name: "Scout Leathers", hp: 20, moveSpeed: 1.08, regen: 0, burnImmune: false, slowImmune: false, special: "+8% move speed", source: "shop", cost: { gold: 200 } },
  { id: "ranger_mail", name: "Ranger Mail", hp: 45, moveSpeed: 1.0, regen: 0.5, burnImmune: false, slowImmune: false, special: "Regen 0.5 HP/s", source: "shop", cost: { gold: 500, level: 3 } },
  { id: "emberplate", name: "Emberplate", hp: 80, moveSpeed: 0.92, regen: 0, burnImmune: true, slowImmune: false, special: "Immune to burn", source: "craft", cost: { gold: 300, materials: { emberstone: 3, oakwood: 2 } } },
  { id: "frostweave", name: "Frostweave", hp: 60, moveSpeed: 1.05, regen: 1, burnImmune: false, slowImmune: true, special: "Immune to slow · regen 1/s", source: "craft", cost: { gold: 500, materials: { frostiron: 3, emberstone: 2 } } },
  { id: "warden_aegis", name: "Warden Aegis", hp: 130, moveSpeed: 0.95, regen: 1.5, burnImmune: false, slowImmune: false, special: "Fortress · regen 1.5/s", source: "craft", cost: { gold: 900, materials: { tidepearl: 3, frostiron: 2, emberstone: 2 } } },
];

export const bowById = (id: string) => BOWS.find((b) => b.id === id) ?? BOWS[0];
export const armorById = (id: string | null) => ARMORS.find((a) => a.id === id) ?? ARMORS[0];

// ---------------------------------------------------------------------------
// Elements

export interface ElementDef {
  id: Element;
  name: string;
  level: number;
  effect: string;
}

export const ELEMENTS: ElementDef[] = [
  { id: "normal", name: "Steel", level: 1, effect: "Pure damage" },
  { id: "fire", name: "Fire", level: 2, effect: "Burn 8 dps for 3s" },
  { id: "ice", name: "Ice", level: 4, effect: "Slow to 45% for 2.5s" },
  { id: "storm", name: "Storm", level: 6, effect: "Chains 60 dmg to nearest foe" },
  { id: "toxin", name: "Toxin", level: 8, effect: "Poison 5 dps for 6s, spreads" },
];

export const elementUnlocked = (el: Element, level: number) =>
  level >= (ELEMENTS.find((e) => e.id === el)?.level ?? 99);

// ---------------------------------------------------------------------------
// Abilities

export interface AbilityDef {
  id: AbilityId;
  name: string;
  cooldown: number;
  effect: string;
  glyph: string; // icon name
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  focus: { id: "focus", name: "Focus", cooldown: 18, effect: "Slow time to 35% for 3.5s", glyph: "eye-circle" },
  multishot: { id: "multishot", name: "Multishot", cooldown: 12, effect: "Next shot fires 3 arrows", glyph: "arrow-split-vertical" },
  powershot: { id: "powershot", name: "Power Shot", cooldown: 15, effect: "Next shot pierces 3, ×1.8 dmg", glyph: "arrow-projectile" },
  warcry: { id: "warcry", name: "Warcry", cooldown: 25, effect: "Heal 30%, allies +15% dmg 6s", glyph: "bullhorn" },
};

export function abilityLoadout(klass: ClassId): AbilityId[] {
  const sig = CLASSES[klass].signature;
  const rest: AbilityId[] = ["multishot", "focus", "powershot", "warcry"].filter((a) => a !== sig) as AbilityId[];
  return [sig, ...rest];
}

export function abilityCooldown(id: AbilityId, klass: ClassId): number {
  const base = ABILITIES[id].cooldown;
  return klass === "ranger" && id === "multishot" ? base * 0.7 : base;
}

// ---------------------------------------------------------------------------
// Allies

export const ALLIES: Record<AllyType, { name: string; blurb: string; hp: number; dmg: number; fireRate: number; speed: number }> = {
  scout: { name: "Scout", blurb: "Fast and nimble, quick weak shots", hp: 80, dmg: 12, fireRate: 1.3, speed: 190 },
  marksman: { name: "Marksman", blurb: "Slow, deadly accurate shots", hp: 90, dmg: 30, fireRate: 2.6, speed: 120 },
  tank: { name: "Shieldbearer", blurb: "Taunts brutes, melee bulwark", hp: 260, dmg: 18, fireRate: 1.1, speed: 130 },
};

// ---------------------------------------------------------------------------
// Difficulty

export const DIFFICULTIES: { id: Difficulty; name: string; desc: string; mult: number }[] = [
  { id: "story", name: "Story", desc: "Relaxed foes, full trajectory guide. For the tale.", mult: 0.7 },
  { id: "normal", name: "Normal", desc: "The intended challenge.", mult: 1.0 },
  { id: "hero", name: "Hero", desc: "Tougher, sharper enemies. Better rewards.", mult: 1.35 },
  { id: "legend", name: "Legend", desc: "Brutal foes, short trajectory guide. Glory awaits.", mult: 1.8 },
];

export const difficultyMult = (d: Difficulty) => DIFFICULTIES.find((x) => x.id === d)?.mult ?? 1;

// ---------------------------------------------------------------------------
// XP / levels

export const xpForLevel = (n: number) => Math.round(100 * Math.pow(n, 1.5));

/** Apply XP gain. Returns new level/xp and how many levels were gained. */
export function applyXp(level: number, xp: number, gain: number): { level: number; xp: number; gained: number } {
  let lv = level;
  let cur = xp + gain;
  let gained = 0;
  while (lv < MAX_LEVEL && cur >= xpForLevel(lv)) {
    cur -= xpForLevel(lv);
    lv += 1;
    gained += 1;
  }
  if (lv >= MAX_LEVEL) cur = Math.min(cur, xpForLevel(MAX_LEVEL));
  return { level: lv, xp: cur, gained };
}

// ---------------------------------------------------------------------------
// Mastery

export const MASTERY_RANKS: { name: string; stars: number; level: number }[] = [
  { name: "Trainee", stars: 0, level: 1 },
  { name: "Marksman", stars: 3, level: 1 },
  { name: "Sharpshooter", stars: 6, level: 5 },
  { name: "Windcaller", stars: 9, level: 10 },
  { name: "Legend of Ardenfall", stars: 9, level: 15 },
];

export function masteryRank(drillStars: number, level: number): number {
  let r = 0;
  MASTERY_RANKS.forEach((m, i) => {
    if (drillStars >= m.stars && level >= m.level) r = i;
  });
  return r;
}

export const DRILLS: { id: DrillId; name: string; desc: string }[] = [
  { id: "range", name: "Range Master", desc: "Ring 3 distant bells." },
  { id: "wind", name: "Wind Caller", desc: "Ring 3 bells in a howling gale." },
  { id: "guard", name: "Guard Breaker", desc: "Break 3 shield-dummies — aim for the head." },
];

// ---------------------------------------------------------------------------
// Costs

export function canAfford(
  cost: Cost,
  gold: number,
  materials: Record<MaterialId, number>,
  level: number,
): { ok: boolean; reason?: string } {
  if (cost.level && level < cost.level) return { ok: false, reason: `Requires level ${cost.level}` };
  if (gold < cost.gold) return { ok: false, reason: `Need ${cost.gold - gold} more gold` };
  for (const [m, n] of Object.entries(cost.materials ?? {})) {
    if ((materials[m as MaterialId] ?? 0) < (n ?? 0)) return { ok: false, reason: `Need more ${m}` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Loadout derivation (save → engine stats)

export interface LoadoutInput {
  name: string;
  level: number;
  klass: ClassId;
  attrs: Attrs;
  bowId: string;
  armorId: string | null;
  element: Element;
  drillStars: number;
}

export function buildLoadout(i: LoadoutInput): PlayerLoadout {
  const cls = CLASSES[i.klass];
  const bow = bowById(i.bowId);
  const armor = armorById(i.armorId);
  const rank = masteryRank(i.drillStars, i.level);
  const baseHp = 100 + (i.level - 1) * 8 + i.attrs.vitality * 12 + armor.hp;
  return {
    name: i.name,
    klass: i.klass,
    level: i.level,
    maxHp: Math.round(baseHp * cls.hpMul),
    damage: bow.damage * (1 + i.attrs.power * 0.04) * (1 + rank * 0.02),
    drawSpeed: bow.drawSpeed * cls.drawMul,
    agility: i.attrs.agility,
    precision: i.attrs.precision,
    power: i.attrs.power,
    critChance: Math.min(0.6, 0.05 + bow.critBonus + cls.critBonus + i.attrs.precision * 0.01),
    moveSpeed: armor.moveSpeed * (1 + i.attrs.agility * 0.02),
    regen: armor.regen,
    speedMul: bow.range,
    pierce: bow.pierce,
    multishotBonus: bow.multishotBonus,
    windResist: bow.windResist,
    element: elementUnlocked(i.element, i.level) ? i.element : "normal",
    abilities: abilityLoadout(i.klass),
    burnImmune: armor.burnImmune,
    slowImmune: armor.slowImmune,
    masteryRank: rank,
    bowId: bow.id,
  };
}
