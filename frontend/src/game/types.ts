// Core type definitions for the Zeekay Game World simulation.
// Pure data types — no React, no Skia. Shared by engine, renderer, data and UI.

export type Element = "normal" | "fire" | "ice" | "storm" | "toxin";
export type Difficulty = "story" | "normal" | "hero" | "legend";
export type ClassId = "ranger" | "stalker" | "warden";
export type AllyType = "scout" | "marksman" | "tank";
export type KingdomId = "vale" | "ember" | "frost" | "isles";
export type BiomeId = KingdomId | "arena" | "yard";
export type MaterialId = "oakwood" | "emberstone" | "frostiron" | "tidepearl";
export type AbilityId = "focus" | "multishot" | "powershot" | "warcry";
export type DrillId = "range" | "wind" | "guard";
export type HazardId = "none" | "geysers" | "blizzard" | "lightning";
export type SecretId = "noMiss" | "noDamageTaken" | "gateFull" | "speedRun120" | "allCagesFirst";
export type MusicId = "forest" | "ember" | "frost" | "isles" | "title" | "boss";

export type MissionType =
  | "clear"
  | "rescue"
  | "escort"
  | "defense"
  | "boss"
  | "waves"
  | "survival"
  | "duel"
  | "coop"
  | "training";

export type ScoreMode = "arena_duel" | "arena_survival" | "arena_tournament" | "arena_coop";

export type EnemyKind = "grunt" | "archer" | "shield" | "shaman" | "boss" | "champion" | "dummy";
export type FighterKind = "player" | AllyType | EnemyKind | "escort";
export type Team = 0 | 1; // 0 = Kaia's side, 1 = hostile

export interface Vec {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Mission definitions (content)

export interface SpawnDef {
  kind: EnemyKind;
  count: number;
}

export interface GroupDef {
  /** World x where the group stands guard (clear/rescue/escort). Omit for "march in from the right". */
  x?: number;
  /** Seconds after the previous wave is cleared (wave-based missions) before this one spawns. */
  delay?: number;
  spawns: SpawnDef[];
}

export interface PropDef {
  kind: "crate" | "barrel" | "cage" | "bell";
  x: number;
  /** Height above ground for bells (training targets). */
  lift?: number;
}

export interface BossDef {
  name: string;
  title: string;
  hp: number;
  body: string; // main color
  trim: string; // accent color
}

export interface StageDef {
  id: string;
  kingdom: KingdomId | "arena" | "training";
  biome: BiomeId;
  name: string;
  type: MissionType;
  tier: number;
  blurb: string;
  objective: string;
  windBase: number;
  windVar: number;
  hazard: HazardId;
  music: MusicId;
  worldW: number;
  parTime: number;
  secret: SecretId | null;
  /** Hostages required (rescue). */
  hostages?: number;
  /** Clear/rescue/escort: guarded groups by x. Wave missions: sequential waves. */
  groups: GroupDef[];
  props: PropDef[];
  boss?: BossDef;
  /** Score-submitting arena mode (if any). */
  scoreMode?: ScoreMode;
  /** Training drill id (if training). */
  drill?: DrillId;
  /** Recommended player level (for scaling + UI). */
  recLevel: number;
  /** Arena: enemy damage multiplier (tournament rounds). */
  dmgScale?: number;
  /** Champion (duel/tournament) display name. */
  champion?: string;
}

// ---------------------------------------------------------------------------
// Engine configuration (built from save + mission by the combat screen)

export interface PlayerLoadout {
  name: string;
  klass: ClassId;
  level: number;
  maxHp: number;
  damage: number;
  drawSpeed: number; // multiplier (bow × class)
  agility: number;
  precision: number;
  power: number;
  critChance: number; // 0..1
  moveSpeed: number; // multiplier
  regen: number; // hp/s
  speedMul: number; // arrow speed multiplier (bow range)
  pierce: number;
  multishotBonus: number;
  windResist: number; // 0..1 share of wind ignored
  element: Element;
  abilities: AbilityId[];
  burnImmune: boolean;
  slowImmune: boolean;
  masteryRank: number; // 0..4
  bowId: string;
}

export interface EngineConfig {
  stage: StageDef;
  difficulty: Difficulty;
  player: PlayerLoadout;
  allies: AllyType[];
  tutorial: boolean;
  /** Seed for deterministic hazards/spawn jitter (tests). */
  seed?: number;
}

// ---------------------------------------------------------------------------
// Runtime entities

export interface Statuses {
  burn: number;
  slow: number;
  poison: number;
  poisonSpread: boolean;
  shock: number; // visual flash timer
}

export type FighterState =
  | "idle"
  | "move"
  | "draw"
  | "windup"
  | "strike"
  | "cast"
  | "charge-tell"
  | "charge"
  | "slam-tell"
  | "recover"
  | "dead";

export interface Fighter {
  id: number;
  kind: FighterKind;
  team: Team;
  name: string;
  x: number; // feet center
  y: number; // feet (ground) y
  vx: number;
  vy: number;
  w: number;
  h: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  dmg: number;
  speed: number;
  alive: boolean;
  state: FighterState;
  stateT: number;
  cd: number; // attack cooldown
  cd2: number; // secondary (heal / summon / slam)
  draw: number; // 0..1
  angle: number; // aim angle radians (0 = horizontal, + = up)
  anim: number; // walk cycle phase
  hitFlash: number;
  statuses: Statuses;
  body: string;
  trim: string;
  aggro: boolean;
  guardX: number;
  targetId: number; // -1 = none, -2 = gate
  preferEscort: boolean;
  preferHostage: boolean;
  tauntT: number;
  phase: 1 | 2 | 3;
  summoned70: boolean;
  enraged: boolean;
  shield: boolean;
  /** Ally buff (warcry) remaining. */
  buffT: number;
  /** Escort walking progress state. */
  cower: boolean;
  scale: number;
}

export type ArrowKind = "arrow" | "orb" | "rain";

export interface Arrow {
  id: number;
  ownerId: number;
  team: Team;
  kind: ArrowKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  element: Element;
  damage: number;
  pierce: number;
  hitIds: number[];
  trail: Vec[];
  alive: boolean;
  stuck: number; // >0 = stuck in ground, seconds left to show
  age: number;
  fromX: number;
  isPlayer: boolean;
  power: boolean;
  scored: boolean; // player arrow already counted as hit
  windMul: number;
  /** Player volley id (multishot arrows share one); 0 for non-player arrows. */
  volley: number;
}

export interface Hostage {
  id: number;
  cageId: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  freed: boolean;
  alive: boolean;
  saved: boolean;
  t: number;
  freedAge: number;
  anim: number;
  hitFlash: number;
}

export type PropKind = "crate" | "barrel" | "cage" | "gate" | "bell";

export interface Prop {
  id: number;
  kind: PropKind;
  x: number; // center x
  y: number; // bottom y
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  hostageId: number;
  hitFlash: number;
  swing: number; // bells
}

export interface Pickup {
  id: number;
  kind: "gold" | "heal";
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  t: number;
  alive: boolean;
}

export type ParticleKind = "spark" | "dust" | "ember" | "shard" | "ring" | "heal" | "smoke" | "leaf" | "snow" | "drop";

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  big: boolean;
}

export interface RagNode {
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface Ragdoll {
  nodes: RagNode[]; // 0 head, 1 neck, 2 hip, 3 handL, 4 footL, 5 footR
  sticks: [number, number, number][];
  life: number;
  body: string;
  trim: string;
  scale: number;
}

export type TelegraphKind = "slam" | "lightning" | "geyser" | "icicle" | "rain";

export interface Telegraph {
  id: number;
  kind: TelegraphKind;
  x: number;
  w: number;
  t: number; // seconds until it fires
  total: number;
  fired: boolean;
  active: number; // seconds of active damage / visual after firing
  dmg: number;
  team: Team | -1; // -1 = hurts everyone (hazards)
}

export interface Shockwave {
  x: number;
  r: number;
  maxR: number;
  dmg: number;
  hitIds: number[];
  team: Team;
}

export interface Bolt {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
}

export type EngineEventType =
  | "draw"
  | "release"
  | "hit"
  | "crit"
  | "thud"
  | "explosion"
  | "free"
  | "pickup"
  | "hurt"
  | "blocked"
  | "victory"
  | "defeat"
  | "boss"
  | "levelup"
  | "wave"
  | "ability";

export interface EngineEvent {
  type: EngineEventType;
  text?: string;
}

export interface ScoreLine {
  label: string;
  value: number;
}

export interface EngineResult {
  victory: boolean;
  score: number;
  breakdown: ScoreLine[];
  kills: number;
  headshots: number;
  shots: number;
  hits: number;
  hostagesSaved: number;
  hostagesLost: number;
  gatePct: number;
  time: number;
  stars: [boolean, boolean, boolean];
  secretDone: boolean;
  wave: number;
  damageTaken: number;
  hpPct: number;
}

export interface HudSnapshot {
  hp: number;
  maxHp: number;
  draw: number;
  drawing: boolean;
  wind: number;
  element: Element;
  abilities: { id: AbilityId; cd: number; max: number; armed: boolean; active: boolean }[];
  objective: string;
  progress: string;
  hostages: { alive: boolean; freed: boolean; saved: boolean }[];
  boss: { name: string; title: string; hp: number; maxHp: number; phase: number } | null;
  gate: { hp: number; maxHp: number } | null;
  escort: { hp: number; maxHp: number; progress: number } | null;
  wave: number;
  score: number;
  time: number;
  streak: number;
  introCard: { title: string; subtitle: string } | null;
  focus: boolean;
  over: boolean;
  allies: { kind: AllyType; hp: number; maxHp: number; alive: boolean }[];
}
