// Campaign, arena and training mission definitions.

import type { DrillId, KingdomId, MaterialId, ScoreMode, SecretId, StageDef } from "./types";

export const STORY = {
  title: "The Shattered Sunshard",
  text:
    "The realm of Ardenfall was shattered when the Hollow King broke the Sunshard into four fragments, one per kingdom. " +
    "You are Kaia, a ranger of Emerald Vale, sworn to reunite the shards. Each kingdom's boss holds a fragment; " +
    "each victory restores light to the world map.",
};

export interface KingdomDef {
  id: KingdomId;
  index: number;
  name: string;
  subtitle: string;
  hazard: string;
  music: string;
  material: MaterialId;
  stages: string[];
}

export const KINGDOMS: KingdomDef[] = [
  { id: "vale", index: 1, name: "Emerald Vale", subtitle: "Where Kaia's oath was sworn", hazard: "None", music: "Warm marimba · 84 bpm", material: "oakwood", stages: ["vale-1", "vale-2", "vale-3"] },
  { id: "ember", index: 2, name: "Emberpeak", subtitle: "Mountains that bleed fire", hazard: "Geysers", music: "Phrygian saws · 112 bpm", material: "emberstone", stages: ["ember-1", "ember-2", "ember-3"] },
  { id: "frost", index: 3, name: "Frost Reach", subtitle: "A silence of ice and wolves", hazard: "Blizzard & icicles", music: "Airy bells · 68 bpm", material: "frostiron", stages: ["frost-1", "frost-2", "frost-3"] },
  { id: "isles", index: 4, name: "Sunken Isles", subtitle: "Drowned temples, angry skies", hazard: "Lightning", music: "Dorian plucks · 104 bpm", material: "tidepearl", stages: ["isles-1", "isles-2", "isles-3"] },
];

export const SECRETS: Record<SecretId, { name: string; desc: string }> = {
  noMiss: { name: "Flawless Quiver", desc: "Finish without missing a shot." },
  noDamageTaken: { name: "Untouchable", desc: "Finish without taking damage." },
  gateFull: { name: "Unbroken Gate", desc: "Keep the gate untouched." },
  speedRun120: { name: "Swift as Wind", desc: "Win in under 120 seconds." },
  allCagesFirst: { name: "Mercy First", desc: "Free every hostage before slaying any foe." },
};

const W = 2800;

const STAGES: StageDef[] = [
  // ---------------- Emerald Vale ----------------
  {
    id: "vale-1", kingdom: "vale", biome: "vale", name: "First Arrows", type: "clear", tier: 1, recLevel: 1,
    blurb: "Hollow scouts creep through the Vale. Learn the bow: drag to aim, watch the wind, release to loose.",
    objective: "Defeat all Hollow scouts", windBase: 0, windVar: 12, hazard: "none", music: "forest", worldW: W, parTime: 90,
    secret: "noMiss",
    groups: [{ x: 1150, spawns: [{ kind: "grunt", count: 2 }] }, { x: 1900, spawns: [{ kind: "grunt", count: 2 }, { kind: "archer", count: 1 }] }],
    props: [{ kind: "crate", x: 800 }, { kind: "barrel", x: 1750 }, { kind: "crate", x: 2300 }],
  },
  {
    id: "vale-2", kingdom: "vale", biome: "vale", name: "Whispering Thicket", type: "rescue", tier: 2, recLevel: 2, hostages: 2,
    blurb: "Villagers are caged deep in the thicket. Shoot the cages open — and mind your stray arrows.",
    objective: "Free 2 caged villagers", windBase: 10, windVar: 20, hazard: "none", music: "forest", worldW: W, parTime: 120,
    secret: "allCagesFirst",
    groups: [{ x: 1350, spawns: [{ kind: "grunt", count: 2 }, { kind: "archer", count: 1 }] }, { x: 2250, spawns: [{ kind: "grunt", count: 2 }, { kind: "archer", count: 2 }] }],
    props: [{ kind: "cage", x: 1150 }, { kind: "cage", x: 2050 }, { kind: "crate", x: 700 }, { kind: "barrel", x: 1600 }],
  },
  {
    id: "vale-3", kingdom: "vale", biome: "vale", name: "Grove Warden", type: "boss", tier: 3, recLevel: 3,
    blurb: "The corrupted guardian of the Vale holds the first Sunshard fragment in its heartwood.",
    objective: "Defeat the Grove Warden", windBase: -10, windVar: 25, hazard: "none", music: "boss", worldW: 1900, parTime: 150,
    secret: "speedRun120",
    boss: { name: "GROVE WARDEN", title: "Heartwood Corrupted", hp: 1300, body: "#3B5A2A", trim: "#B7E06A" },
    groups: [{ spawns: [{ kind: "grunt", count: 1 }] }],
    props: [{ kind: "barrel", x: 900 }],
  },
  // ---------------- Emberpeak ----------------
  {
    id: "ember-1", kingdom: "ember", biome: "ember", name: "Ashen Ascent", type: "defense", tier: 4, recLevel: 4,
    blurb: "Hold the outpost gate as Hollow raiders climb the ash slopes. Geysers erupt without mercy.",
    objective: "Defend the gate for 3 waves", windBase: 20, windVar: 25, hazard: "geysers", music: "ember", worldW: 1900, parTime: 140,
    secret: "gateFull",
    groups: [
      { delay: 2, spawns: [{ kind: "grunt", count: 3 }, { kind: "archer", count: 1 }] },
      { delay: 4, spawns: [{ kind: "grunt", count: 3 }, { kind: "shield", count: 1 }, { kind: "archer", count: 1 }] },
      { delay: 4, spawns: [{ kind: "grunt", count: 3 }, { kind: "shield", count: 1 }, { kind: "archer", count: 2 }] },
    ],
    props: [{ kind: "barrel", x: 1000 }, { kind: "barrel", x: 1400 }],
  },
  {
    id: "ember-2", kingdom: "ember", biome: "ember", name: "Bridge of Cinders", type: "escort", tier: 5, recLevel: 5,
    blurb: "Escort Elder Toma's caravan across the burning bridge. Raiders will go for the caravan.",
    objective: "Escort Elder Toma to safety", windBase: -15, windVar: 30, hazard: "geysers", music: "ember", worldW: W, parTime: 150,
    secret: "noDamageTaken",
    groups: [
      { x: 1000, spawns: [{ kind: "grunt", count: 2 }, { kind: "archer", count: 1 }] },
      { x: 1700, spawns: [{ kind: "grunt", count: 2 }, { kind: "shield", count: 1 }] },
      { x: 2400, spawns: [{ kind: "grunt", count: 2 }, { kind: "archer", count: 1 }, { kind: "shaman", count: 1 }] },
    ],
    props: [{ kind: "crate", x: 1300 }, { kind: "barrel", x: 2100 }],
  },
  {
    id: "ember-3", kingdom: "ember", biome: "ember", name: "Magmaclaw", type: "boss", tier: 6, recLevel: 6,
    blurb: "A molten beast coils around the second fragment at the caldera's heart.",
    objective: "Defeat Magmaclaw", windBase: 25, windVar: 30, hazard: "geysers", music: "boss", worldW: 1900, parTime: 160,
    secret: "noMiss",
    boss: { name: "MAGMACLAW", title: "Tyrant of the Caldera", hp: 1900, body: "#5A1E14", trim: "#FF7A33" },
    groups: [{ spawns: [{ kind: "grunt", count: 1 }, { kind: "archer", count: 1 }] }],
    props: [{ kind: "barrel", x: 1000 }],
  },
  // ---------------- Frost Reach ----------------
  {
    id: "frost-1", kingdom: "frost", biome: "frost", name: "Frozen Outpost", type: "defense", tier: 7, recLevel: 7,
    blurb: "A blizzard howls over the last outpost. Hold its gate — the wind will fight your aim.",
    objective: "Defend the gate for 3 waves", windBase: -30, windVar: 35, hazard: "blizzard", music: "frost", worldW: 1900, parTime: 160,
    secret: "gateFull",
    groups: [
      { delay: 2, spawns: [{ kind: "grunt", count: 3 }, { kind: "archer", count: 2 }] },
      { delay: 4, spawns: [{ kind: "grunt", count: 3 }, { kind: "shield", count: 2 }, { kind: "shaman", count: 1 }] },
      { delay: 4, spawns: [{ kind: "grunt", count: 4 }, { kind: "shield", count: 1 }, { kind: "archer", count: 2 }, { kind: "shaman", count: 1 }] },
    ],
    props: [{ kind: "barrel", x: 1100 }],
  },
  {
    id: "frost-2", kingdom: "frost", biome: "frost", name: "Glacier Gauntlet", type: "waves", tier: 8, recLevel: 8,
    blurb: "Run the gauntlet of the glacier pass. Icicles fall where the ice groans.",
    objective: "Survive 4 waves", windBase: 35, windVar: 35, hazard: "blizzard", music: "frost", worldW: 1900, parTime: 170,
    secret: "noMiss",
    groups: [
      { delay: 2, spawns: [{ kind: "grunt", count: 3 }, { kind: "archer", count: 2 }] },
      { delay: 3, spawns: [{ kind: "shield", count: 2 }, { kind: "archer", count: 2 }] },
      { delay: 3, spawns: [{ kind: "grunt", count: 4 }, { kind: "shaman", count: 1 }] },
      { delay: 3, spawns: [{ kind: "grunt", count: 3 }, { kind: "shield", count: 2 }, { kind: "archer", count: 2 }, { kind: "shaman", count: 1 }] },
    ],
    props: [{ kind: "crate", x: 900 }, { kind: "barrel", x: 1300 }],
  },
  {
    id: "frost-3", kingdom: "frost", biome: "frost", name: "Jarl Svartnor", type: "boss", tier: 9, recLevel: 9,
    blurb: "The frost-jarl wears the third fragment as a crown. His storms bend every arrow.",
    objective: "Defeat Jarl Svartnor", windBase: -35, windVar: 40, hazard: "blizzard", music: "boss", worldW: 1900, parTime: 170,
    secret: "speedRun120",
    boss: { name: "JARL SVARTNOR", title: "Crowned in Rime", hp: 2600, body: "#2E3F57", trim: "#BFE6FF" },
    groups: [{ spawns: [{ kind: "shield", count: 1 }, { kind: "archer", count: 1 }] }],
    props: [{ kind: "barrel", x: 1000 }],
  },
  // ---------------- Sunken Isles ----------------
  {
    id: "isles-1", kingdom: "isles", biome: "isles", name: "Tidebreaker Shore", type: "rescue", tier: 10, recLevel: 10, hostages: 3,
    blurb: "Pearl-divers are caged along the shore as a storm rolls in. Lightning strikes where the sky glows.",
    objective: "Free 3 caged divers", windBase: 25, windVar: 35, hazard: "lightning", music: "isles", worldW: W, parTime: 160,
    secret: "allCagesFirst",
    groups: [
      { x: 1100, spawns: [{ kind: "grunt", count: 2 }, { kind: "archer", count: 1 }] },
      { x: 1750, spawns: [{ kind: "shield", count: 1 }, { kind: "archer", count: 2 }] },
      { x: 2400, spawns: [{ kind: "grunt", count: 2 }, { kind: "shaman", count: 1 }, { kind: "archer", count: 1 }] },
    ],
    props: [{ kind: "cage", x: 950 }, { kind: "cage", x: 1600 }, { kind: "cage", x: 2250 }, { kind: "barrel", x: 1350 }, { kind: "crate", x: 2000 }],
  },
  {
    id: "isles-2", kingdom: "isles", biome: "isles", name: "Temple of Storms", type: "waves", tier: 11, recLevel: 11,
    blurb: "Fight up the drowned temple steps through wave after wave of storm-cultists.",
    objective: "Survive 4 waves", windBase: -30, windVar: 40, hazard: "lightning", music: "isles", worldW: 1900, parTime: 180,
    secret: "noDamageTaken",
    groups: [
      { delay: 2, spawns: [{ kind: "grunt", count: 3 }, { kind: "archer", count: 2 }] },
      { delay: 3, spawns: [{ kind: "shield", count: 2 }, { kind: "shaman", count: 1 }, { kind: "archer", count: 1 }] },
      { delay: 3, spawns: [{ kind: "grunt", count: 4 }, { kind: "archer", count: 2 }] },
      { delay: 3, spawns: [{ kind: "grunt", count: 3 }, { kind: "shield", count: 2 }, { kind: "archer", count: 2 }, { kind: "shaman", count: 2 }] },
    ],
    props: [{ kind: "barrel", x: 1000 }, { kind: "barrel", x: 1450 }],
  },
  {
    id: "isles-3", kingdom: "isles", biome: "isles", name: "Leviathan Priest", type: "boss", tier: 12, recLevel: 12,
    blurb: "The Hollow King's high priest calls the sea itself to war. Take back the final fragment.",
    objective: "Defeat the Leviathan Priest", windBase: 30, windVar: 45, hazard: "lightning", music: "boss", worldW: 1900, parTime: 180,
    secret: "noMiss",
    boss: { name: "LEVIATHAN PRIEST", title: "Voice of the Drowned", hp: 3400, body: "#123F4A", trim: "#3DBFA8" },
    groups: [{ spawns: [{ kind: "shaman", count: 1 }, { kind: "archer", count: 1 }] }],
    props: [{ kind: "barrel", x: 950 }],
  },
];

// ---------------- Arena ----------------
export const TOURNAMENT_ROUNDS = [
  { champion: "Ravenna the Quick", round: "Quarterfinal", dmgScale: 1.0 },
  { champion: "Old Bram", round: "Semifinal", dmgScale: 1.15 },
  { champion: "The Hollow King", round: "Final", dmgScale: 1.35 },
];

const ARENA: StageDef[] = [
  {
    id: "arena_duel", kingdom: "arena", biome: "arena", name: "Champion's Duel", type: "duel", tier: 6, recLevel: 5,
    blurb: "One archer, one champion. Out-aim Corvin before he out-aims you.", objective: "Defeat Corvin the Champion",
    windBase: 0, windVar: 35, hazard: "none", music: "boss", worldW: 1900, parTime: 90, secret: null, scoreMode: "arena_duel",
    champion: "Corvin the Champion", groups: [{ spawns: [{ kind: "champion", count: 1 }] }], props: [],
  },
  {
    id: "arena_survival", kingdom: "arena", biome: "arena", name: "Endless Survival", type: "survival", tier: 4, recLevel: 3,
    blurb: "Waves without end. How long can you hold the sand?", objective: "Survive as long as you can",
    windBase: 0, windVar: 30, hazard: "none", music: "ember", worldW: 1900, parTime: 999, secret: null, scoreMode: "arena_survival",
    groups: [], props: [{ kind: "barrel", x: 1100 }],
  },
  ...TOURNAMENT_ROUNDS.map(
    (r, i): StageDef => ({
      id: `arena_tournament-${i + 1}`, kingdom: "arena", biome: "arena", name: `Tournament ${r.round}`, type: "duel", tier: 6 + i * 2,
      recLevel: 5 + i * 2, blurb: `${r.round}: face ${r.champion}.`, objective: `Defeat ${r.champion}`, windBase: 0, windVar: 30 + i * 8,
      hazard: "none", music: "boss", worldW: 1900, parTime: 90, secret: null, scoreMode: "arena_tournament", dmgScale: r.dmgScale,
      champion: r.champion, groups: [{ spawns: [{ kind: "champion", count: 1 }] }], props: [],
    }),
  ),
  {
    id: "arena_coop", kingdom: "arena", biome: "arena", name: "Co-op Siege", type: "coop", tier: 8, recLevel: 6,
    blurb: "You and two allies against the Iron Colossus and its endless thralls.", objective: "Defeat the Iron Colossus",
    windBase: 0, windVar: 30, hazard: "none", music: "boss", worldW: 1900, parTime: 180, secret: null, scoreMode: "arena_coop",
    boss: { name: "IRON COLOSSUS", title: "Arena Juggernaut", hp: 2200, body: "#4A4F5A", trim: "#E05A36" },
    groups: [{ spawns: [{ kind: "grunt", count: 2 }] }], props: [{ kind: "barrel", x: 1000 }],
  },
];

// ---------------- Training Yard ----------------
const TRAINING: StageDef[] = [
  {
    id: "training_range", kingdom: "training", biome: "yard", name: "Range Master", type: "training", tier: 1, recLevel: 1, drill: "range",
    blurb: "Ring three distant bells. Fewer arrows, more stars.", objective: "Ring 3 bells", windBase: 0, windVar: 8,
    hazard: "none", music: "forest", worldW: 2400, parTime: 60, secret: null, groups: [],
    props: [{ kind: "bell", x: 1250, lift: 120 }, { kind: "bell", x: 1600, lift: 260 }, { kind: "bell", x: 1950, lift: 60 }],
  },
  {
    id: "training_wind", kingdom: "training", biome: "yard", name: "Wind Caller", type: "training", tier: 1, recLevel: 1, drill: "wind",
    blurb: "A gale at full force. Read the wind, ring the bells.", objective: "Ring 3 bells in max wind", windBase: 120, windVar: 0,
    hazard: "none", music: "forest", worldW: 2400, parTime: 60, secret: null, groups: [],
    props: [{ kind: "bell", x: 1000, lift: 160 }, { kind: "bell", x: 1300, lift: 40 }, { kind: "bell", x: 1550, lift: 220 }],
  },
  {
    id: "training_guard", kingdom: "training", biome: "yard", name: "Guard Breaker", type: "training", tier: 1, recLevel: 1, drill: "guard",
    blurb: "Shield-dummies block body shots. Only headshots break them.", objective: "Break 3 shield-dummies", windBase: 0, windVar: 10,
    hazard: "none", music: "forest", worldW: 2000, parTime: 60, secret: null, groups: [{ spawns: [{ kind: "dummy", count: 3 }] }], props: [],
  },
];

export const ALL_STAGES: StageDef[] = [...STAGES, ...ARENA, ...TRAINING];
export const STORY_STAGES = STAGES;

export function getMission(id: string): StageDef | undefined {
  return ALL_STAGES.find((s) => s.id === id);
}

export function kingdomOf(stageId: string): KingdomDef | undefined {
  return KINGDOMS.find((k) => k.stages.includes(stageId));
}

export function nextStageId(stageId: string): string | null {
  const i = STAGES.findIndex((s) => s.id === stageId);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1].id : null;
}

export const drillStage = (d: DrillId) => `training_${d}`;

export const ARENA_MODES: { mode: ScoreMode; stageId: string; name: string; desc: string; glyph: string }[] = [
  { mode: "arena_duel", stageId: "arena_duel", name: "Duel", desc: "1v1 against a champion archer.", glyph: "sword-cross" },
  { mode: "arena_survival", stageId: "arena_survival", name: "Survival", desc: "Endless waves. Score = kills × wave.", glyph: "shield-sword" },
  { mode: "arena_tournament", stageId: "arena_tournament-1", name: "Tournament", desc: "Three duels to the crown.", glyph: "trophy-variant" },
  { mode: "arena_coop", stageId: "arena_coop", name: "Co-op", desc: "Two AI allies vs. a colossus.", glyph: "account-group" },
];

export const MODE_LABEL: Record<ScoreMode, string> = {
  arena_duel: "Duel",
  arena_survival: "Survival",
  arena_tournament: "Tournament",
  arena_coop: "Co-op",
};
