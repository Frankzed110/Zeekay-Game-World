// Save schema (§6) + pure progression rules: rewards, stars, unlocks, tournament flow, mastery.
// No React here so it can be unit-tested headlessly.

import { KINGDOMS, STORY_STAGES, TOURNAMENT_ROUNDS, getMission, kingdomOf } from "@/src/game/missions";
import { applyXp, ATTR_POINTS_PER_LEVEL, buildLoadout, difficultyMult, type Attrs } from "@/src/game/rpg";
import type { AllyType, ClassId, Difficulty, DrillId, Element, EngineResult, MaterialId, PlayerLoadout, ScoreMode, StageDef } from "@/src/game/types";

export const SAVE_VERSION = 1;

export interface StageProgress {
  stars: number;
  best: number;
  secretDone: boolean;
}

export interface SaveData {
  version: number;
  profile: { name: string; level: number; xp: number; gold: number; klass: ClassId; attrPoints: number; attrs: Attrs };
  progress: {
    stages: Record<string, StageProgress>;
    kingdomsUnlocked: number;
    difficulty: Difficulty;
    tutorialDone: boolean;
    tournament: { round: number; score: number };
    arenaBest: Partial<Record<ScoreMode, number>>;
  };
  inventory: { bows: string[]; armors: string[]; crafted: string[]; materials: Record<MaterialId, number> };
  equipped: { bow: string; armor: string | null; element: Element; ally: AllyType; coopAllies: [AllyType, AllyType] };
  mastery: { challenges: Partial<Record<DrillId, { stars: number; best: number }>> };
  stats: { kills: number; headshots: number; shots: number; hits: number; arenasWon: number; bestSurvivalWave: number; totalScore: number; hostagesSaved: number };
  settings: { music: boolean; sfx: boolean };
  updated_at: string;
}

export function defaultSave(name = "Kaia"): SaveData {
  return {
    version: SAVE_VERSION,
    profile: { name, level: 1, xp: 0, gold: 0, klass: "ranger", attrPoints: 0, attrs: { power: 0, precision: 0, agility: 0, vitality: 0 } },
    progress: { stages: {}, kingdomsUnlocked: 1, difficulty: "normal", tutorialDone: false, tournament: { round: 0, score: 0 }, arenaBest: {} },
    inventory: { bows: ["hunter_shortbow"], armors: ["travelers_garb"], crafted: [], materials: { oakwood: 0, emberstone: 0, frostiron: 0, tidepearl: 0 } },
    equipped: { bow: "hunter_shortbow", armor: "travelers_garb", element: "normal", ally: "marksman", coopAllies: ["marksman", "tank"] },
    mastery: { challenges: {} },
    stats: { kills: 0, headshots: 0, shots: 0, hits: 0, arenasWon: 0, bestSurvivalWave: 0, totalScore: 0, hostagesSaved: 0 },
    settings: { music: true, sfx: true },
    updated_at: new Date(0).toISOString(),
  };
}

/** Deep-merge an unknown payload over defaults so older / partial saves load safely. */
export function normalizeSave(raw: unknown, fallbackName?: string): SaveData {
  const base = defaultSave(fallbackName);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<SaveData>;
  const merged: SaveData = {
    ...base,
    ...r,
    version: SAVE_VERSION,
    profile: { ...base.profile, ...(r.profile ?? {}), attrs: { ...base.profile.attrs, ...(r.profile?.attrs ?? {}) } },
    progress: {
      ...base.progress,
      ...(r.progress ?? {}),
      tournament: { ...base.progress.tournament, ...(r.progress?.tournament ?? {}) },
      arenaBest: { ...(r.progress?.arenaBest ?? {}) },
      stages: { ...(r.progress?.stages ?? {}) },
    },
    inventory: { ...base.inventory, ...(r.inventory ?? {}), materials: { ...base.inventory.materials, ...(r.inventory?.materials ?? {}) } },
    equipped: { ...base.equipped, ...(r.equipped ?? {}) },
    mastery: { challenges: { ...(r.mastery?.challenges ?? {}) } },
    stats: { ...base.stats, ...(r.stats ?? {}) },
    settings: { ...base.settings, ...(r.settings ?? {}) },
    updated_at: typeof r.updated_at === "string" ? r.updated_at : base.updated_at,
  };
  if (!merged.inventory.bows.includes("hunter_shortbow")) merged.inventory.bows.unshift("hunter_shortbow");
  if (!merged.inventory.armors.includes("travelers_garb")) merged.inventory.armors.unshift("travelers_garb");
  return merged;
}

/** Cloud merge rule: newer `updated_at` wins. */
export function pickNewer(local: SaveData, remote: SaveData | null): SaveData {
  if (!remote) return local;
  return Date.parse(remote.updated_at) > Date.parse(local.updated_at) ? remote : local;
}

// ---------------------------------------------------------------------------
// Queries

export function drillStars(s: SaveData) {
  return Object.values(s.mastery.challenges).reduce((a, c) => a + (c?.stars ?? 0), 0);
}

export function loadoutFromSave(s: SaveData): PlayerLoadout {
  return buildLoadout({
    name: s.profile.name,
    level: s.profile.level,
    klass: s.profile.klass,
    attrs: s.profile.attrs,
    bowId: s.equipped.bow,
    armorId: s.equipped.armor,
    element: s.equipped.element,
    drillStars: drillStars(s),
  });
}

export function stageUnlocked(s: SaveData, stageId: string): boolean {
  const stage = getMission(stageId);
  if (!stage) return false;
  if (stage.kingdom === "arena" || stage.kingdom === "training") return true;
  const k = kingdomOf(stageId);
  if (!k || k.index > s.progress.kingdomsUnlocked) return false;
  const i = k.stages.indexOf(stageId);
  if (i <= 0) return true;
  return (s.progress.stages[k.stages[i - 1]]?.stars ?? 0) >= 1;
}

/** Next story stage to play (first unlocked without a clear, else last unlocked). */
export function nextStoryStage(s: SaveData): string {
  let last = STORY_STAGES[0].id;
  for (const st of STORY_STAGES) {
    if (!stageUnlocked(s, st.id)) break;
    last = st.id;
    if ((s.progress.stages[st.id]?.stars ?? 0) === 0) return st.id;
  }
  return last;
}

export function totalStars(s: SaveData) {
  return Object.values(s.progress.stages).reduce((a, p) => a + p.stars, 0);
}

export function hasProgress(s: SaveData) {
  return Object.keys(s.progress.stages).length > 0 || s.profile.level > 1;
}

// ---------------------------------------------------------------------------
// Applying a finished mission

export interface Rewards {
  xp: number;
  gold: number;
  materials: Partial<Record<MaterialId, number>>;
  levelsGained: number;
  newLevel: number;
  starsEarned: number;
  newBest: boolean;
  unlockedStage: string | null;
  unlockedKingdom: string | null;
  secretFirstTime: boolean;
  tournament: { finished: boolean; won: boolean; nextRound: number | null; total: number } | null;
}

export interface ScoreSubmission {
  mode: ScoreMode;
  arena_id: string;
  score: number;
  wave: number;
}

export interface ApplyOutcome {
  save: SaveData;
  rewards: Rewards;
  submit: ScoreSubmission | null;
}

const MATERIAL_IDS: MaterialId[] = ["oakwood", "emberstone", "frostiron", "tidepearl"];

export function applyMissionResult(prev: SaveData, stage: StageDef, r: EngineResult, difficulty: Difficulty, goldFound: number, rand: () => number = Math.random): ApplyOutcome {
  const s: SaveData = normalizeSave(JSON.parse(JSON.stringify(prev)));
  const mult = difficultyMult(difficulty);
  const isSurvival = stage.type === "survival";
  const isTraining = stage.type === "training";
  const success = r.victory || (isSurvival && r.wave >= 1);

  // XP / gold
  let xp: number;
  let gold: number;
  if (isTraining) {
    xp = r.victory ? 30 + r.stars.filter(Boolean).length * 20 : 10;
    gold = goldFound;
  } else if (success) {
    xp = Math.round((40 * stage.tier + r.kills * 8) * mult);
    gold = Math.round((30 * stage.tier + 20 * r.kills) * mult) + goldFound;
  } else {
    xp = Math.round(r.kills * 4 * mult);
    gold = goldFound + 10 * r.kills;
  }

  // Materials
  const materials: Partial<Record<MaterialId, number>> = {};
  if (success && !isTraining) {
    const k = kingdomOf(stage.id);
    const mat = k ? k.material : MATERIAL_IDS[Math.floor(rand() * MATERIAL_IDS.length)];
    const n = 1 + Math.floor(rand() * 3) + (stage.type === "boss" ? 1 : 0);
    materials[mat] = n;
    s.inventory.materials[mat] += n;
  }

  const lv = applyXp(s.profile.level, s.profile.xp, xp);
  s.profile.level = lv.level;
  s.profile.xp = lv.xp;
  s.profile.attrPoints += lv.gained * ATTR_POINTS_PER_LEVEL;
  s.profile.gold += gold;

  // Stats
  s.stats.kills += r.kills;
  s.stats.headshots += r.headshots;
  s.stats.shots += r.shots;
  s.stats.hits += r.hits;
  s.stats.hostagesSaved += r.hostagesSaved;
  s.stats.totalScore += r.score;
  if (isSurvival) s.stats.bestSurvivalWave = Math.max(s.stats.bestSurvivalWave, r.wave);

  // Story stars / unlocks
  let starsEarned = 0;
  let newBest = false;
  let unlockedStage: string | null = null;
  let unlockedKingdom: string | null = null;
  let secretFirstTime = false;
  const k = kingdomOf(stage.id);
  if (k) {
    const before = s.progress.stages[stage.id] ?? { stars: 0, best: 0, secretDone: false };
    const stars = r.stars.filter(Boolean).length;
    starsEarned = stars;
    newBest = r.score > before.best;
    secretFirstTime = r.secretDone && !before.secretDone;
    const wasCleared = before.stars > 0;
    s.progress.stages[stage.id] = { stars: Math.max(before.stars, stars), best: Math.max(before.best, r.score), secretDone: before.secretDone || r.secretDone };
    if (r.victory && !wasCleared) {
      const i = k.stages.indexOf(stage.id);
      if (i < k.stages.length - 1) unlockedStage = k.stages[i + 1];
      else if (k.index < KINGDOMS.length && s.progress.kingdomsUnlocked <= k.index) {
        s.progress.kingdomsUnlocked = k.index + 1;
        unlockedKingdom = KINGDOMS[k.index].name;
        unlockedStage = KINGDOMS[k.index].stages[0];
      }
    }
  }

  // Training mastery
  if (isTraining && stage.drill) {
    const c = s.mastery.challenges[stage.drill] ?? { stars: 0, best: 0 };
    const stars = r.stars.filter(Boolean).length;
    newBest = r.score > c.best;
    s.mastery.challenges[stage.drill] = { stars: Math.max(c.stars, stars), best: Math.max(c.best, r.score) };
    starsEarned = stars;
  }

  // Arena
  let submit: ScoreSubmission | null = null;
  let tournament: Rewards["tournament"] = null;
  if (stage.scoreMode) {
    const mode = stage.scoreMode;
    if (mode === "arena_tournament") {
      const t = s.progress.tournament;
      const total = t.score + r.score;
      if (r.victory && t.round < TOURNAMENT_ROUNDS.length - 1) {
        s.progress.tournament = { round: t.round + 1, score: total };
        tournament = { finished: false, won: false, nextRound: t.round + 1, total };
      } else {
        const won = r.victory;
        if (won) s.stats.arenasWon += 1;
        s.progress.tournament = { round: 0, score: 0 };
        tournament = { finished: true, won, nextRound: null, total };
        submit = { mode, arena_id: stage.id, score: total, wave: t.round + 1 };
      }
    } else {
      if (r.victory && mode !== "arena_survival") s.stats.arenasWon += 1;
      submit = { mode, arena_id: stage.id, score: r.score, wave: r.wave };
    }
    if (submit) {
      const best = s.progress.arenaBest[mode] ?? 0;
      if (submit.score > best) {
        s.progress.arenaBest[mode] = submit.score;
        newBest = true;
      }
    }
  }

  s.updated_at = new Date().toISOString();
  return {
    save: s,
    rewards: { xp, gold, materials, levelsGained: lv.gained, newLevel: lv.level, starsEarned, newBest, unlockedStage, unlockedKingdom, secretFirstTime, tournament },
    submit,
  };
}
