// Zeekay Game World — combat simulation.
// Pure TypeScript: no React, no Skia. The combat screen drives `update(dt)` each frame,
// feeds input through the action methods, drains `events` into the SFX pool and hands the
// engine to the renderer.

import { abilityCooldown, ALLIES, CLASSES, difficultyMult } from "./rpg";
import { ALLY_COLORS, ENEMY_COLORS, TEAM_COLORS } from "./palette";
import type {
  AbilityId,
  AllyType,
  Arrow,
  Bolt,
  EngineConfig,
  EngineEvent,
  EngineEventType,
  EngineResult,
  EnemyKind,
  Element,
  Fighter,
  FighterKind,
  Floater,
  Hostage,
  HudSnapshot,
  Particle,
  ParticleKind,
  Pickup,
  Prop,
  PropKind,
  Ragdoll,
  ScoreLine,
  Shockwave,
  StageDef,
  Team,
  Telegraph,
  TelegraphKind,
  Vec,
} from "./types";

// ---------------------------------------------------------------------------
// World & physics constants (§11.1)

export const WORLD_W = 2800;
export const WORLD_H = 900;
export const GROUND_Y = 820;
export const G = 1500;
export const ARROW_MIN_SPEED = 620;
export const ARROW_MAX_SPEED = 1450;
export const MAX_WIND = 120;
export const BASE_DRAW_TIME = 1.1;
export const HEADSHOT_ZONE = 0.2;
export const SLOWMO_FACTOR = 0.35;
export const MAX_DT = 0.033;

const AIM_MIN = -0.35;
const AIM_MAX = 1.45;
const GATE_X = 110;

type Target =
  | { kind: "fighter"; f: Fighter; x: number; y: number; h: number }
  | { kind: "gate"; p: Prop; x: number; y: number; h: number }
  | { kind: "hostage"; hst: Hostage; x: number; y: number; h: number };

interface EnemyStats {
  hp: number;
  dmg: number;
  speed: number;
  w: number;
  h: number;
}

const ENEMY_BASE: Record<Exclude<EnemyKind, "boss">, EnemyStats> = {
  grunt: { hp: 70, dmg: 12, speed: 95, w: 46, h: 104 },
  archer: { hp: 55, dmg: 10, speed: 85, w: 42, h: 106 },
  shield: { hp: 120, dmg: 14, speed: 55, w: 56, h: 110 },
  shaman: { hp: 65, dmg: 8, speed: 70, w: 44, h: 108 },
  champion: { hp: 150, dmg: 15, speed: 120, w: 44, h: 110 },
  dummy: { hp: 60, dmg: 0, speed: 0, w: 50, h: 110 },
};

const ENEMY_NAMES: Record<Exclude<EnemyKind, "boss">, string> = {
  grunt: "Hollow Brute",
  archer: "Hollow Archer",
  shield: "Hollow Shieldbearer",
  shaman: "Hollow Shaman",
  champion: "Champion",
  dummy: "Shield Dummy",
};

/** Aim error (radians, 1σ-ish) for enemy archers by difficulty. */
const AIM_ERROR = { story: 0.13, normal: 0.075, hero: 0.05, legend: 0.03 } as const;
/** Share of wind the enemy compensates for. */
const WIND_COMP = { story: 0, normal: 0.35, hero: 0.65, legend: 0.9 } as const;

// ---------------------------------------------------------------------------
// Small helpers

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Segment vs AABB (Liang–Barsky). Returns entry param t∈[0,1] or -1. */
function segmentAabb(x1: number, y1: number, x2: number, y2: number, minX: number, minY: number, maxX: number, maxY: number): number {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - minX, maxX - x1, y1 - minY, maxY - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return -1;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return -1;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return -1;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0;
}

/**
 * Launch angle (radians, + = up) to hit a point dx away horizontally (>0) and dyUp above,
 * with speed v and gravity g. Returns the low-arc solution, or null if out of range.
 */
export function solveLaunchAngle(dx: number, dyUp: number, v: number, g: number = G): number | null {
  const v2 = v * v;
  const disc = v2 * v2 - g * (g * dx * dx + 2 * dyUp * v2);
  if (disc < 0) return null;
  return Math.atan2(v2 - Math.sqrt(disc), g * dx);
}

let NEXT_ID = 1;
const nid = () => NEXT_ID++;

// ---------------------------------------------------------------------------

export class Engine {
  readonly cfg: EngineConfig;
  readonly stage: StageDef;
  readonly worldW: number;
  readonly rng: () => number;
  readonly diffMult: number;

  fighters: Fighter[] = [];
  arrows: Arrow[] = [];
  hostages: Hostage[] = [];
  props: Prop[] = [];
  pickups: Pickup[] = [];
  particles: Particle[] = [];
  floaters: Floater[] = [];
  ragdolls: Ragdoll[] = [];
  telegraphs: Telegraph[] = [];
  shockwaves: Shockwave[] = [];
  bolts: Bolt[] = [];
  events: EngineEvent[] = [];

  player!: Fighter;
  escort: Fighter | null = null;
  gate: Prop | null = null;
  boss: Fighter | null = null;

  /** Simulation clock (world time incl. slow-mo). */
  t = 0;
  /** Mission timer (real seconds). */
  time = 0;
  wind = 0;
  windPhase: number;
  camX = 0;
  shake = 0;
  introT = 0;
  introCard: { title: string; subtitle: string } | null = null;

  // Input state
  drawing = false;
  aim = 0.35;
  moveDir: -1 | 0 | 1 = 0;
  overdrawT = 0;
  element: Element;

  // Abilities
  cds: Record<AbilityId, number> = { focus: 0, multishot: 0, powershot: 0, warcry: 0 };
  multishotArmed = false;
  powershotArmed = false;
  focusT = 0;
  warcryT = 0;

  // Stats
  kills = 0;
  headshots = 0;
  shots = 0;
  hits = 0;
  misses = 0;
  longShots = 0;
  streak = 0;
  bestStreak = 0;
  streakBonus = 0;
  damageTaken = 0;
  hostagesSaved = 0;
  hostagesLost = 0;
  hostagesFreed = 0;
  freedAllBeforeKill = false;
  goldFound = 0;
  bellsRung = 0;
  /** Open player volleys: a release counts as a miss only if none of its arrows connect. */
  volleys = new Map<number, { left: number; hit: boolean }>();
  dummiesBroken = 0;

  // Waves
  waveIndex = 0; // number of waves spawned
  waveTimer = 0;
  waveCleared = true;
  survivalWave = 0;
  coopAddT = 14;
  hazardT = 4;
  hurtCooldown = 0;

  over = false;
  overT = 0;
  victory = false;
  result: EngineResult | null = null;

  constructor(cfg: EngineConfig) {
    this.cfg = cfg;
    this.stage = cfg.stage;
    this.worldW = cfg.stage.worldW || WORLD_W;
    this.rng = mulberry32(cfg.seed ?? Math.floor(Math.random() * 1e9));
    this.diffMult = difficultyMult(cfg.difficulty);
    this.windPhase = this.rng() * Math.PI * 2;
    this.element = cfg.player.element;
    this.setup();
  }

  // -------------------------------------------------------------------------
  // Setup

  private get hpScale() {
    const s = this.stage;
    const over = clamp(this.cfg.player.level - s.recLevel, 0, 10);
    return this.diffMult * (1 + 0.1 * (s.tier - 1)) * (1 + 0.04 * over);
  }

  private get dmgScale() {
    const s = this.stage;
    return this.diffMult * (1 + 0.07 * (s.tier - 1)) * (s.dmgScale ?? 1);
  }

  private makeFighter(kind: FighterKind, team: Team, x: number, o: Partial<Fighter> = {}): Fighter {
    return {
      id: nid(),
      kind,
      team,
      name: kind,
      x,
      y: GROUND_Y,
      vx: 0,
      vy: 0,
      w: 44,
      h: 110,
      facing: team === 0 ? 1 : -1,
      hp: 100,
      maxHp: 100,
      dmg: 10,
      speed: 100,
      alive: true,
      state: "idle",
      stateT: 0,
      cd: 1 + this.rng(),
      cd2: 4 + this.rng() * 2,
      draw: 0,
      angle: 0.3,
      anim: this.rng() * 10,
      hitFlash: 0,
      statuses: { burn: 0, slow: 0, poison: 0, poisonSpread: false, shock: 0 },
      body: "#888",
      trim: "#ccc",
      aggro: true,
      guardX: x,
      targetId: -1,
      preferEscort: false,
      preferHostage: false,
      tauntT: 0,
      phase: 1,
      summoned70: false,
      enraged: false,
      shield: false,
      buffT: 0,
      cower: false,
      scale: 1,
      ...o,
    };
  }

  private setup() {
    const s = this.stage;
    const p = this.cfg.player;
    const startX = s.type === "defense" ? 300 : 260;
    this.player = this.makeFighter("player", 0, startX, {
      name: p.name,
      hp: p.maxHp,
      maxHp: p.maxHp,
      speed: 230 * p.moveSpeed,
      body: TEAM_COLORS.player.body,
      trim: TEAM_COLORS.player.trim,
    });
    this.fighters.push(this.player);

    // Allies
    this.cfg.allies.forEach((a, i) => this.spawnAlly(a, startX - 70 - i * 60));

    // Props
    for (const pd of s.props) {
      this.addProp(pd.kind, pd.x, pd.lift ?? 0);
    }
    if (s.type === "defense") {
      this.gate = this.addProp("gate", GATE_X, 0);
    }

    // Escort
    if (s.type === "escort") {
      this.escort = this.makeFighter("escort", 0, startX + 60, {
        name: "Elder Toma",
        hp: 320 * Math.min(1.4, this.diffMult),
        maxHp: 320 * Math.min(1.4, this.diffMult),
        speed: 62,
        w: 70,
        h: 100,
        body: TEAM_COLORS.escort.body,
        trim: TEAM_COLORS.escort.trim,
      });
      this.escort.hp = this.escort.maxHp;
      this.fighters.push(this.escort);
    }

    // Enemies
    if (s.type === "clear" || s.type === "rescue" || s.type === "escort") {
      for (const g of s.groups) {
        let i = 0;
        for (const sp of g.spawns) {
          for (let k = 0; k < sp.count; k++) {
            const gx = (g.x ?? 1200) + (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * 70 + (sp.kind === "archer" || sp.kind === "shaman" ? 160 : 0);
            const e = this.spawnEnemy(sp.kind, clamp(gx, 400, this.worldW - 60), false);
            if (s.type === "escort" && this.rng() < 0.4) e.preferEscort = true;
            if (s.type === "rescue" && sp.kind === "grunt" && this.rng() < 0.3) e.preferHostage = true;
            i++;
          }
        }
      }
    } else if (s.type === "boss" || s.type === "coop") {
      const def = s.boss!;
      const hp = def.hp * this.hpScale;
      this.boss = this.makeFighter("boss", 1, this.worldW - 480, {
        name: def.name,
        hp,
        maxHp: hp,
        dmg: (15 + s.tier * 0.6) * this.dmgScale,
        speed: 75,
        w: 120,
        h: 200,
        body: def.body,
        trim: def.trim,
        cd: 3,
        cd2: 6,
        scale: 1.7,
      });
      this.fighters.push(this.boss);
      for (const g of s.groups) for (const sp of g.spawns) for (let k = 0; k < sp.count; k++) this.spawnEnemy(sp.kind, this.worldW - 650 - k * 80, true);
      this.introT = 2.2;
      this.introCard = { title: def.name, subtitle: `${def.title} — emerges…` };
      this.emit("boss");
    } else if (s.type === "duel") {
      const champ = this.spawnEnemy("champion", Math.min(this.worldW - 200, startX + 950), true);
      champ.name = s.champion ?? "Champion";
      champ.maxHp = champ.hp = p.maxHp * 1.6 * (0.85 + 0.25 * this.diffMult) * (s.dmgScale ?? 1);
      this.introT = 1.6;
      this.introCard = { title: champ.name.toUpperCase(), subtitle: "steps into the arena" };
    } else if (s.type === "training" && s.drill === "guard") {
      [900, 1200, 1500].forEach((x) => {
        const d = this.spawnEnemy("dummy", x, true);
        d.shield = true;
      });
    }

    if (s.type === "defense" || s.type === "waves") {
      this.waveTimer = s.groups[0]?.delay ?? 2;
      this.waveCleared = true;
    }
    if (s.type === "survival") this.waveTimer = 2;

    this.camX = 0;
    this.updateWind(0);
  }

  private addProp(kind: PropKind, x: number, lift: number): Prop {
    const dims: Record<PropKind, [number, number, number]> = {
      crate: [56, 56, 30],
      barrel: [48, 64, 20],
      cage: [74, 96, 40],
      gate: [46, 230, 700],
      bell: [44, 44, 1],
    };
    const [w, h, hp] = dims[kind];
    const maxHp = kind === "gate" ? hp * Math.max(0.8, this.diffMult) : hp;
    const prop: Prop = { id: nid(), kind, x, y: GROUND_Y - lift, w, h, hp: maxHp, maxHp, alive: true, hostageId: -1, hitFlash: 0, swing: 0 };
    this.props.push(prop);
    if (kind === "cage") {
      const hst: Hostage = { id: nid(), cageId: prop.id, x, y: GROUND_Y, hp: 90, maxHp: 90, freed: false, alive: true, saved: false, t: 0, freedAge: 0, anim: this.rng() * 6, hitFlash: 0 };
      prop.hostageId = hst.id;
      this.hostages.push(hst);
    }
    return prop;
  }

  private spawnAlly(type: AllyType, x: number) {
    const a = ALLIES[type];
    const c = ALLY_COLORS[type];
    const f = this.makeFighter(type, 0, x, {
      name: a.name,
      hp: a.hp * (1 + 0.05 * (this.cfg.player.level - 1)),
      maxHp: a.hp * (1 + 0.05 * (this.cfg.player.level - 1)),
      dmg: a.dmg * (1 + 0.06 * (this.cfg.player.level - 1)) * (1 + CLASSES[this.cfg.player.klass].allyDmgBonus),
      speed: a.speed,
      body: c.body,
      trim: c.trim,
      w: type === "tank" ? 56 : 42,
      h: type === "tank" ? 112 : 104,
      cd: a.fireRate,
    });
    f.hp = f.maxHp;
    this.fighters.push(f);
  }

  spawnEnemy(kind: EnemyKind, x: number, aggro: boolean): Fighter {
    if (kind === "boss") throw new Error("use boss setup");
    const b = ENEMY_BASE[kind];
    const c = ENEMY_COLORS[kind];
    const hp = b.hp * (kind === "dummy" ? 1 : this.hpScale);
    const f = this.makeFighter(kind, 1, x, {
      name: ENEMY_NAMES[kind],
      hp,
      maxHp: hp,
      dmg: b.dmg * this.dmgScale,
      speed: b.speed * (0.9 + this.rng() * 0.2),
      w: b.w,
      h: b.h,
      body: c.body,
      trim: c.trim,
      aggro,
      shield: kind === "shield" || kind === "dummy",
      cd: kind === "archer" ? 1.5 + this.rng() * 1.5 : 1 + this.rng(),
    });
    this.fighters.push(f);
    return f;
  }

  // -------------------------------------------------------------------------
  // Input actions (controller-ready seam)

  beginDraw() {
    if (this.over || !this.player.alive) return;
    if (!this.drawing) this.emit("draw");
    this.drawing = true;
    this.player.draw = 0;
    this.overdrawT = 0;
  }

  /** Slingshot drag vector in screen space: drag down-left aims up-right. */
  aimDelta(dx: number, dy: number) {
    if (Math.hypot(dx, dy) < 6) return;
    const facing: 1 | -1 = dx <= 0 ? 1 : -1;
    this.player.facing = facing;
    this.aim = clamp(Math.atan2(dy, Math.abs(dx)), AIM_MIN, AIM_MAX);
  }

  /** Set aim directly toward a world point (mouse aim). */
  aimAt(wx: number, wy: number) {
    const o = this.bowOrigin(this.player);
    const dx = wx - o.x;
    const dy = o.y - wy;
    this.player.facing = dx >= 0 ? 1 : -1;
    this.aim = clamp(Math.atan2(dy, Math.abs(dx)), AIM_MIN, AIM_MAX);
  }

  aimNudge(rad: number) {
    this.aim = clamp(this.aim + rad, AIM_MIN, AIM_MAX);
  }

  setFacing(f: 1 | -1) {
    this.player.facing = f;
  }

  releaseDraw() {
    if (!this.drawing) return;
    this.drawing = false;
    if (this.over || !this.player.alive) return;
    const draw = this.player.draw;
    this.player.draw = 0;
    if (draw < 0.12) return; // too weak — cancel
    this.firePlayer(draw);
  }

  cancelDraw() {
    this.drawing = false;
    this.player.draw = 0;
  }

  setMove(dir: -1 | 0 | 1) {
    this.moveDir = dir;
  }

  setElement(el: Element) {
    this.element = el;
  }

  useAbility(slot: number) {
    if (this.over || !this.player.alive) return;
    const id = this.cfg.player.abilities[slot];
    if (!id || this.cds[id] > 0) return;
    const klass = this.cfg.player.klass;
    this.cds[id] = abilityCooldown(id, klass);
    const p = this.player;
    this.emit("ability", id);
    switch (id) {
      case "focus":
        this.focusT = 3.5;
        this.floatText(p.x, p.y - p.h - 30, "FOCUS", "#C8A8FF", true);
        break;
      case "multishot":
        this.multishotArmed = true;
        this.floatText(p.x, p.y - p.h - 30, "MULTISHOT READY", "#FFD24A", false);
        break;
      case "powershot":
        this.powershotArmed = true;
        this.floatText(p.x, p.y - p.h - 30, "POWER SHOT READY", "#FF8A3D", false);
        break;
      case "warcry": {
        const healPct = klass === "warden" ? 0.4 : 0.3;
        this.heal(p, p.maxHp * healPct);
        this.warcryT = 6;
        for (const f of this.fighters) if (f.team === 0 && f.alive && f !== p) f.buffT = 6;
        if (klass === "warden" && this.fighters.some((f) => f.team === 0 && f.alive && f !== p && f.kind !== "escort")) {
          for (const e of this.fighters) if (e.team === 1 && e.alive) e.tauntT = 6;
        }
        this.ring(p.x, p.y - p.h * 0.5, "#6EE7A0", 18);
        this.floatText(p.x, p.y - p.h - 30, "WARCRY!", "#6EE7A0", true);
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Derived

  bowOrigin(f: Fighter): Vec {
    return { x: f.x + f.facing * f.w * 0.32, y: f.y - f.h * 0.62 };
  }

  get drawTime() {
    const p = this.cfg.player;
    return BASE_DRAW_TIME / (p.drawSpeed * (1 + p.agility * 0.04));
  }

  /** Current aim incl. sway (precision steadies it; overdraw shakes it). */
  get effectiveAim(): number {
    if (!this.drawing) return this.aim;
    const prec = Math.max(0.25, 1 - this.cfg.player.precision * 0.06);
    const amp = 0.028 * prec * (1 + Math.min(3, this.overdrawT * 1.6));
    return clamp(this.aim + Math.sin(this.t * 2.3) * amp + Math.sin(this.t * 3.9 + 1.3) * amp * 0.5, AIM_MIN, AIM_MAX);
  }

  arrowSpeed(draw: number) {
    return (ARROW_MIN_SPEED + draw * (ARROW_MAX_SPEED - ARROW_MIN_SPEED)) * this.cfg.player.speedMul;
  }

  /** Trajectory preview incl. wind. */
  previewTrajectory(steps: number): Vec[] {
    const o = this.bowOrigin(this.player);
    const draw = Math.max(0.15, this.player.draw);
    const v = this.arrowSpeed(draw);
    const a = this.effectiveAim;
    let x = o.x;
    let y = o.y;
    let vx = Math.cos(a) * v * this.player.facing;
    let vy = -Math.sin(a) * v;
    const windMul = 1 - this.cfg.player.windResist;
    const pts: Vec[] = [];
    const dt = 0.045;
    for (let i = 0; i < steps; i++) {
      vx += this.wind * windMul * dt;
      vy += G * dt;
      x += vx * dt;
      y += vy * dt;
      if (y > GROUND_Y) break;
      pts.push({ x, y });
    }
    return pts;
  }

  // -------------------------------------------------------------------------
  // Events / FX helpers

  emit(type: EngineEventType, text?: string) {
    this.events.push({ type, text });
  }

  drainEvents(): EngineEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  floatText(x: number, y: number, text: string, color: string, big: boolean) {
    this.floaters.push({ x, y, text, color, life: big ? 1.3 : 1.0, maxLife: big ? 1.3 : 1.0, big });
  }

  burst(x: number, y: number, kind: ParticleKind, color: string, n: number, speed = 260, gravity = 900, size = 4) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2;
      const s = speed * (0.3 + this.rng() * 0.8);
      const life = 0.4 + this.rng() * 0.5;
      this.particles.push({ kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.3, life, maxLife: life, size: size * (0.6 + this.rng() * 0.8), color, gravity });
    }
    if (this.particles.length > 420) this.particles.splice(0, this.particles.length - 420);
  }

  ring(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.particles.push({ kind: "heal", x, y, vx: Math.cos(a) * 180, vy: Math.sin(a) * 180, life: 0.6, maxLife: 0.6, size: 5, color, gravity: -60 });
    }
  }

  // -------------------------------------------------------------------------
  // Firing

  private firePlayer(draw: number) {
    const p = this.player;
    const lo = this.cfg.player;
    const o = this.bowOrigin(p);
    const v = this.arrowSpeed(draw);
    const a0 = this.effectiveAim;
    const dmgBase = lo.damage * (0.35 + 0.65 * draw) * (this.warcryT > 0 ? 1.1 : 1);
    let count = 1;
    let pierce = lo.pierce;
    let dmg = dmgBase;
    const power = this.powershotArmed;
    if (this.multishotArmed) {
      count = 3 + lo.multishotBonus;
      this.multishotArmed = false;
    }
    if (power) {
      pierce += 3;
      dmg *= 1.8;
      this.powershotArmed = false;
    }
    const volley = nid();
    this.volleys.set(volley, { left: count, hit: false });
    for (let i = 0; i < count; i++) {
      const off = count === 1 ? 0 : (i - (count - 1) / 2) * 0.07;
      const a = a0 + off;
      this.arrows.push({
        id: nid(),
        ownerId: p.id,
        team: 0,
        kind: "arrow",
        x: o.x,
        y: o.y,
        vx: Math.cos(a) * v * p.facing,
        vy: -Math.sin(a) * v,
        element: this.element,
        damage: dmg,
        pierce,
        hitIds: [],
        trail: [],
        alive: true,
        stuck: 0,
        age: 0,
        fromX: o.x,
        isPlayer: true,
        power,
        scored: false,
        windMul: 1 - lo.windResist,
        volley,
      });
    }
    this.shots += count;
    this.emit("release");
  }

  private fireEnemyArrow(f: Fighter, tx: number, ty: number, tvx: number, opts: { speed?: number; kind?: "arrow" | "orb"; spread?: number; count?: number; errMul?: number; element?: Element } = {}) {
    const o = this.bowOrigin(f);
    const speed = opts.speed ?? 950;
    const g = opts.kind === "orb" ? G * 0.8 : G;
    let dx = tx - o.x;
    const dist = Math.abs(dx);
    const flight = dist / (speed * 0.85);
    dx += tvx * flight; // lead
    const comp = WIND_COMP[this.cfg.difficulty];
    dx -= 0.5 * this.wind * comp * flight * flight;
    const dir: 1 | -1 = dx >= 0 ? 1 : -1;
    f.facing = dir;
    const base = solveLaunchAngle(Math.max(40, Math.abs(dx)), o.y - ty, speed, g) ?? Math.PI / 4;
    const err = AIM_ERROR[this.cfg.difficulty] * (opts.errMul ?? 1);
    const count = opts.count ?? 1;
    for (let i = 0; i < count; i++) {
      const spread = count === 1 ? 0 : (i - (count - 1) / 2) * (opts.spread ?? 0.06);
      const a = base + spread + (this.rng() - 0.5) * 2 * err;
      this.arrows.push({
        id: nid(),
        ownerId: f.id,
        team: f.team,
        kind: opts.kind ?? "arrow",
        x: o.x,
        y: o.y,
        vx: Math.cos(a) * speed * dir,
        vy: -Math.sin(a) * speed,
        element: opts.element ?? (opts.kind === "orb" ? "toxin" : "normal"),
        damage: f.dmg * (f.buffT > 0 ? 1.15 : 1),
        pierce: 0,
        hitIds: [],
        trail: [],
        alive: true,
        stuck: 0,
        age: 0,
        fromX: o.x,
        isPlayer: false,
        power: false,
        scored: false,
        windMul: opts.kind === "orb" ? 0.6 : 1,
        volley: 0,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Damage

  private heal(f: Fighter, amount: number) {
    const before = f.hp;
    f.hp = Math.min(f.maxHp, f.hp + amount);
    const got = Math.round(f.hp - before);
    if (got > 0) this.floatText(f.x, f.y - f.h - 10, `+${got}`, "#6EE7A0", false);
  }

  damageFighter(f: Fighter, amount: number, o: { crit?: "head" | "crit"; byPlayer?: boolean; knock?: number; element?: Element; silent?: boolean } = {}) {
    if (!f.alive || amount <= 0) return;
    if (f.kind === "player" && this.stage.type === "training") return;
    let dmg = amount;
    if (f.kind === "player" && this.introT > 0) return;
    f.hp -= dmg;
    f.hitFlash = 0.15;
    if (o.knock) f.vx += o.knock;
    if (f.team === 0 && (f.kind === "player")) {
      this.damageTaken += dmg;
      if (this.hurtCooldown <= 0) {
        this.emit("hurt");
        this.hurtCooldown = 0.25;
      }
      this.shake = Math.max(this.shake, 6);
    }
    if (f.team === 1 && !f.aggro) f.aggro = true;
    if (!o.silent) {
      const txt = Math.round(dmg).toString();
      if (o.crit === "head") this.floatText(f.x, f.y - f.h - 20, `HEADSHOT ${txt}`, "#FFD24A", true);
      else if (o.crit === "crit") this.floatText(f.x, f.y - f.h - 20, `CRIT ${txt}`, "#FFD24A", true);
      else this.floatText(f.x + (this.rng() - 0.5) * 20, f.y - f.h - 10, txt, f.team === 0 ? "#FF6B6B" : "#FFFFFF", false);
    }
    if (f.hp <= 0) this.kill(f, o.knock ?? 0);
    dmg = 0;
  }

  private kill(f: Fighter, knock: number) {
    f.alive = false;
    f.hp = 0;
    f.state = "dead";
    this.makeRagdoll(f, knock);
    this.emit("thud");
    if (f.team === 1) {
      this.kills += 1;
      if (this.hostages.length > 0 && this.kills === 1) {
        this.freedAllBeforeKill = this.hostages.every((h) => h.freed);
      }
      if (f.kind === "dummy") this.dummiesBroken += 1;
      // drops
      if (f.kind !== "dummy") {
        const coins = 1 + Math.floor(this.rng() * 2);
        for (let i = 0; i < coins; i++) this.dropPickup("gold", f.x, f.y - f.h * 0.5, 5 + Math.floor(this.rng() * 10));
        if (this.rng() < 0.12) this.dropPickup("heal", f.x, f.y - f.h * 0.5, Math.round(this.player.maxHp * 0.15));
      }
      if (f === this.boss) {
        this.shake = 18;
        this.burst(f.x, f.y - f.h * 0.5, "spark", f.trim, 60, 520);
        for (const e of this.fighters) if (e.team === 1 && e.alive) this.damageFighter(e, 9999, { silent: true });
      }
    } else if (f.kind === "player") {
      this.shake = 12;
    }
  }

  private dropPickup(kind: "gold" | "heal", x: number, y: number, value: number) {
    this.pickups.push({ id: nid(), kind, x, y, vx: (this.rng() - 0.5) * 200, vy: -260 - this.rng() * 120, value, t: 0, alive: true });
  }

  private makeRagdoll(f: Fighter, knock: number) {
    const s = f.h / 110;
    const x = f.x;
    const y = f.y;
    const kx = (knock || -f.facing * 120) * 0.016 + (this.rng() - 0.5) * 2;
    const ky = -6 - this.rng() * 4;
    const pts: [number, number][] = [
      [x, y - 100 * s],
      [x, y - 80 * s],
      [x, y - 45 * s],
      [x + f.facing * 22 * s, y - 62 * s],
      [x - 10 * s, y],
      [x + 10 * s, y],
    ];
    const nodes = pts.map(([px, py], i) => ({ x: px, y: py, px: px - kx * (i < 2 ? 1.4 : 0.8), py: py - ky * (i < 2 ? 1.2 : 0.6) }));
    const d = (a: number, b: number) => Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]);
    const sticks: [number, number, number][] = [
      [0, 1, d(0, 1)],
      [1, 2, d(1, 2)],
      [1, 3, d(1, 3)],
      [2, 4, d(2, 4)],
      [2, 5, d(2, 5)],
      [4, 5, d(4, 5)],
      [0, 2, d(0, 2)],
    ];
    this.ragdolls.push({ nodes, sticks, life: 2.5, body: f.body, trim: f.trim, scale: s });
    if (this.ragdolls.length > 14) this.ragdolls.shift();
  }

  private damageHostage(h: Hostage, amount: number) {
    if (!h.alive || h.saved) return;
    h.hp -= amount;
    h.hitFlash = 0.2;
    this.floatText(h.x, h.y - 100, Math.round(amount).toString(), "#FF6B6B", false);
    if (h.hp <= 0) {
      h.alive = false;
      this.hostagesLost += 1;
      this.floatText(h.x, h.y - 120, "HOSTAGE LOST −300", "#FF6B6B", true);
      this.emit("hurt");
    }
  }

  private damageProp(pr: Prop, amount: number, byPlayer: boolean) {
    if (!pr.alive) return;
    pr.hp -= amount;
    pr.hitFlash = 0.15;
    if (pr.kind === "bell") {
      pr.alive = false;
      pr.swing = 1;
      this.bellsRung += 1;
      this.floatText(pr.x, pr.y - 60, "DING!", "#FFD24A", true);
      this.emit("pickup");
      this.burst(pr.x, pr.y - 20, "spark", "#FFD24A", 14, 220, 300);
      return;
    }
    if (pr.kind === "gate") {
      this.emit("blocked");
      if (pr.hp <= 0) {
        pr.alive = false;
        pr.hp = 0;
        this.burst(pr.x, pr.y - pr.h * 0.5, "shard", "#7A5230", 30, 380);
        this.shake = 14;
      }
      return;
    }
    this.burst(pr.x, pr.y - pr.h * 0.5, "shard", pr.kind === "cage" ? "#8C93A3" : "#7A5230", 4, 180);
    if (pr.hp > 0) return;
    pr.alive = false;
    if (pr.kind === "crate") {
      this.burst(pr.x, pr.y - pr.h * 0.5, "shard", "#7A5230", 18, 320);
      this.emit("thud");
      const n = 2 + Math.floor(this.rng() * 3);
      for (let i = 0; i < n; i++) this.dropPickup("gold", pr.x, pr.y - pr.h * 0.6, 8 + Math.floor(this.rng() * 8));
    } else if (pr.kind === "barrel") {
      this.explode(pr.x, pr.y - pr.h * 0.5, 170, 75 * Math.max(1, this.diffMult * 0.9), byPlayer);
    } else if (pr.kind === "cage") {
      this.burst(pr.x, pr.y - pr.h * 0.5, "shard", "#8C93A3", 18, 300);
      const h = this.hostages.find((x) => x.id === pr.hostageId);
      if (h && h.alive) {
        h.freed = true;
        this.hostagesFreed += 1;
        this.floatText(h.x, h.y - 120, "FREED! +150", "#6EE7A0", true);
        this.emit("free");
        if (this.kills === 0 && this.hostages.every((x) => x.freed)) this.freedAllBeforeKill = true;
      }
    }
  }

  explode(x: number, y: number, radius: number, dmg: number, byPlayer: boolean) {
    this.emit("explosion");
    this.shake = Math.max(this.shake, 16);
    this.burst(x, y, "ember", "#FF8A3D", 40, 520, 600, 6);
    this.burst(x, y, "smoke", "rgba(60,50,45,0.8)", 18, 160, -80, 14);
    for (const f of this.fighters) {
      if (!f.alive) continue;
      const d = Math.hypot(f.x - x, f.y - f.h * 0.5 - y);
      if (d < radius) {
        const fall = 1 - d / radius;
        const amount = dmg * (0.4 + 0.6 * fall) * (f.team === 0 ? 0.5 : 1);
        this.damageFighter(f, amount, { byPlayer, knock: Math.sign(f.x - x || 1) * 420 * fall });
        f.vy = -300 * fall;
      }
    }
    for (const h of this.hostages) if (h.freed && h.alive && !h.saved && Math.abs(h.x - x) < radius) this.damageHostage(h, dmg * 0.5);
    for (const pr of this.props) if (pr.alive && pr.kind !== "gate" && pr.kind !== "bell" && Math.abs(pr.x - x) < radius && !(pr.x === x)) this.damageProp(pr, 60, byPlayer);
  }

  private applyElement(target: Fighter, el: Element, byPlayer: boolean) {
    if (!target.alive) return;
    const st = target.statuses;
    if (el === "fire") {
      if (!(target.kind === "player" && this.cfg.player.burnImmune)) st.burn = 3;
    } else if (el === "ice") {
      if (!(target.kind === "player" && this.cfg.player.slowImmune)) st.slow = 2.5;
    } else if (el === "toxin") {
      st.poison = 6;
      st.poisonSpread = false;
    } else if (el === "storm") {
      st.shock = 0.3;
      let best: Fighter | null = null;
      let bd = 380;
      for (const f of this.fighters) {
        if (f === target || !f.alive || f.team !== target.team) continue;
        const d = Math.abs(f.x - target.x);
        if (d < bd) {
          bd = d;
          best = f;
        }
      }
      if (best) {
        this.bolts.push({ x1: target.x, y1: target.y - target.h * 0.6, x2: best.x, y2: best.y - best.h * 0.6, life: 0.25 });
        best.statuses.shock = 0.3;
        this.damageFighter(best, 60 * (byPlayer ? 1 : 0.5), { byPlayer });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Update loop

  update(rawDt: number) {
    const dt = clamp(rawDt, 0, MAX_DT);
    if (this.over) {
      this.overT += dt;
      this.updateFx(dt);
      return;
    }
    const slow = this.focusT > 0 ? SLOWMO_FACTOR : 1;
    const wdt = dt * slow;
    this.t += wdt;
    this.time += dt;
    this.hurtCooldown -= dt;
    if (this.introT > 0) {
      this.introT -= dt;
      if (this.introT <= 0) this.introCard = null;
    }

    this.updateWind(wdt);
    this.updatePlayer(dt);
    for (const k of Object.keys(this.cds) as AbilityId[]) this.cds[k] = Math.max(0, this.cds[k] - dt);
    this.focusT = Math.max(0, this.focusT - dt);
    this.warcryT = Math.max(0, this.warcryT - dt);

    const aiDt = this.introT > 0 ? 0 : wdt;
    for (const f of this.fighters) {
      if (!f.alive || f.kind === "player") continue;
      this.updateStatuses(f, wdt);
      if (!f.alive) continue;
      if (f.team === 0) this.updateFriendly(f, aiDt);
      else this.updateEnemy(f, aiDt);
      this.integrate(f, wdt);
    }
    this.separate();
    this.updateArrows(wdt);
    this.updateHostages(wdt);
    this.updatePickups(wdt);
    this.updateHazards(wdt);
    this.updateSpawns(dt);
    this.updateFx(wdt);
    this.checkEnd();
  }

  private updateWind(dt: number) {
    const s = this.stage;
    const varMul = s.hazard === "blizzard" ? 2 : 1;
    this.windPhase += dt * 0.32;
    const gust = Math.sin(this.windPhase) * 0.75 + Math.sin(this.windPhase * 2.7 + 1.1) * 0.25;
    this.wind = clamp(s.windBase + s.windVar * varMul * gust, -MAX_WIND, MAX_WIND);
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    if (!p.alive) return;
    this.updateStatuses(p, dt);
    if (!p.alive) return;
    const lo = this.cfg.player;
    if (lo.regen > 0) p.hp = Math.min(p.maxHp, p.hp + lo.regen * dt);
    // draw
    if (this.drawing) {
      p.draw = Math.min(1, p.draw + dt / this.drawTime);
      if (p.draw >= 1) this.overdrawT += dt;
      p.state = "draw";
    } else {
      p.state = this.moveDir !== 0 ? "move" : "idle";
    }
    p.angle = this.effectiveAim;
    // move
    const slowMul = p.statuses.slow > 0 ? 0.45 : 1;
    const drawMul = this.drawing ? 0.4 : 1;
    const v = this.moveDir * p.speed * slowMul * drawMul;
    p.x += (v + p.vx) * dt;
    p.vx *= Math.pow(0.02, dt);
    if (this.moveDir !== 0) {
      p.anim += dt * 9 * slowMul * drawMul;
      if (!this.drawing) p.facing = this.moveDir;
    }
    let minX = 60;
    let maxX = this.worldW - 60;
    if (this.stage.type === "defense") {
      minX = 170;
      maxX = 1150;
    }
    p.x = clamp(p.x, minX, maxX);
    this.airborne(p, dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt);
  }

  private airborne(f: Fighter, dt: number) {
    if (f.y < GROUND_Y || f.vy < 0) {
      f.vy += G * dt;
      f.y += f.vy * dt;
      if (f.y >= GROUND_Y) {
        f.y = GROUND_Y;
        f.vy = 0;
      }
    }
  }

  private updateStatuses(f: Fighter, dt: number) {
    const s = f.statuses;
    if (s.burn > 0) {
      s.burn -= dt;
      f.hp -= 8 * dt;
      if (this.rng() < dt * 12) this.particles.push({ kind: "ember", x: f.x + (this.rng() - 0.5) * f.w, y: f.y - this.rng() * f.h, vx: 0, vy: -80, life: 0.5, maxLife: 0.5, size: 4, color: "#FF8A3D", gravity: -100 });
    }
    if (s.poison > 0) {
      s.poison -= dt;
      f.hp -= 5 * dt;
      if (!s.poisonSpread && s.poison < 5) {
        s.poisonSpread = true;
        let best: Fighter | null = null;
        let bd = 250;
        for (const o of this.fighters) {
          if (o === f || !o.alive || o.team !== f.team || o.statuses.poison > 0) continue;
          const d = Math.abs(o.x - f.x);
          if (d < bd) {
            bd = d;
            best = o;
          }
        }
        if (best) {
          best.statuses.poison = 6;
          best.statuses.poisonSpread = true; // spreads once
        }
      }
      if (this.rng() < dt * 8) this.particles.push({ kind: "drop", x: f.x + (this.rng() - 0.5) * f.w, y: f.y - this.rng() * f.h, vx: 0, vy: -40, life: 0.6, maxLife: 0.6, size: 4, color: "#7EE05A", gravity: -60 });
    }
    if (s.slow > 0) s.slow -= dt;
    if (s.shock > 0) s.shock -= dt;
    if ((s.burn > 0 || s.poison > 0) && f.hp <= 0 && f.alive) {
      if (f.kind === "player" && this.stage.type === "training") f.hp = 1;
      else this.kill(f, 0);
    }
    if (f.kind === "player" && (s.burn > 0 || s.poison > 0)) this.damageTaken += ((s.burn > 0 ? 8 : 0) + (s.poison > 0 ? 5 : 0)) * dt;
  }

  private integrate(f: Fighter, dt: number) {
    f.x += f.vx * dt;
    f.vx *= Math.pow(0.03, dt);
    f.x = clamp(f.x, 30, this.worldW - 30);
    this.airborne(f, dt);
    f.hitFlash = Math.max(0, f.hitFlash - dt);
    f.tauntT = Math.max(0, f.tauntT - dt);
    f.buffT = Math.max(0, f.buffT - dt);
  }

  private separate() {
    const list = this.fighters;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive || a.team !== 1 || a.kind === "boss") continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive || b.team !== 1 || b.kind === "boss") continue;
        const d = b.x - a.x;
        if (Math.abs(d) < 34) {
          const push = (34 - Math.abs(d)) * 0.5 * (d >= 0 ? 1 : -1);
          a.x -= push;
          b.x += push;
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // AI

  private moveToward(f: Fighter, tx: number, dt: number, mul = 1) {
    const slow = f.statuses.slow > 0 ? 0.45 : 1;
    const d = tx - f.x;
    const step = f.speed * slow * mul * dt * (f.enraged ? 1.3 : 1);
    if (Math.abs(d) <= step) f.x = tx;
    else f.x += Math.sign(d) * step;
    f.facing = d >= 0 ? 1 : -1;
    f.anim += dt * 8 * slow * mul;
  }

  private nearestEnemyOf(f: Fighter, range: number): Fighter | null {
    let best: Fighter | null = null;
    let bd = range;
    for (const o of this.fighters) {
      if (!o.alive || o.team === f.team) continue;
      if (o.kind === "dummy" && this.stage.type !== "training") continue;
      const d = Math.abs(o.x - f.x);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  private pickTarget(e: Fighter): Target | null {
    const asF = (f: Fighter): Target => ({ kind: "fighter", f, x: f.x, y: f.y, h: f.h });
    // taunt → nearest friendly non-player fighter (tank first)
    if (e.tauntT > 0) {
      const t = this.fighters.find((f) => f.alive && f.team === 0 && f.kind !== "player" && f.kind !== "escort");
      if (t) return asF(t);
    }
    const tank = this.fighters.find((f) => f.alive && f.kind === "tank");
    if (tank && (e.kind === "grunt" || e.kind === "shield") && Math.abs(tank.x - e.x) < 380) return asF(tank);
    const melee = e.kind === "grunt" || e.kind === "shield";
    if (this.gate && this.gate.alive && melee) return { kind: "gate", p: this.gate, x: this.gate.x + this.gate.w * 0.5, y: GROUND_Y, h: this.gate.h };
    if (e.preferEscort && this.escort && this.escort.alive) return asF(this.escort);
    if (e.preferHostage) {
      const h = this.hostages.find((x) => x.freed && x.alive && !x.saved);
      if (h) return { kind: "hostage", hst: h, x: h.x, y: h.y, h: 80 };
    }
    let best: Fighter | null = null;
    let bd = Infinity;
    for (const f of this.fighters) {
      if (!f.alive || f.team !== 0) continue;
      const d = Math.abs(f.x - e.x) * (f.kind === "player" ? 0.8 : 1);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best ? asF(best) : null;
  }

  private hitTarget(e: Fighter, t: Target, dmg: number) {
    if (t.kind === "fighter") this.damageFighter(t.f, dmg, { knock: e.facing * 220 });
    else if (t.kind === "gate") this.damageProp(t.p, dmg, false);
    else this.damageHostage(t.hst, dmg);
  }

  private targetVx(t: Target): number {
    if (t.kind === "fighter") {
      if (t.f.kind === "player") return this.moveDir * t.f.speed * (this.drawing ? 0.4 : 1) * 0.6;
      return 0;
    }
    return 0;
  }

  private updateEnemy(e: Fighter, dt: number) {
    if (dt === 0) return;
    e.stateT += dt;
    e.cd -= dt * (e.enraged ? 1.3 : 1);
    e.cd2 -= dt;
    // Aggro when player approaches (or escort)
    if (!e.aggro) {
      const near = Math.abs(this.player.x - e.x) < 1050 || (this.escort && Math.abs(this.escort.x - e.x) < 700);
      if (near) e.aggro = true;
      else {
        e.anim += dt * 0.5;
        return;
      }
    }
    switch (e.kind) {
      case "grunt":
      case "shield":
        return this.aiMelee(e, dt);
      case "archer":
        return this.aiArcher(e, dt);
      case "shaman":
        return this.aiShaman(e, dt);
      case "champion":
        return this.aiChampion(e, dt);
      case "boss":
        return this.aiBoss(e, dt);
      case "dummy":
        e.facing = this.player.x < e.x ? -1 : 1;
        return;
    }
  }

  private aiMelee(e: Fighter, dt: number) {
    const t = this.pickTarget(e);
    if (!t) return;
    const reach = t.kind === "gate" ? 30 : 58;
    const d = t.x - e.x;
    if (e.state === "windup") {
      if (e.stateT >= 0.6) {
        e.state = "strike";
        e.stateT = 0;
        if (Math.abs(d) < reach + 30) this.hitTarget(e, t, e.dmg * (e.buffT > 0 ? 1.15 : 1));
      }
      return;
    }
    if (e.state === "strike") {
      if (e.stateT >= 0.25) {
        e.state = "recover";
        e.stateT = 0;
        e.cd = 0.8 + this.rng() * 0.4;
      }
      return;
    }
    if (Math.abs(d) <= reach) {
      e.facing = d >= 0 ? 1 : -1;
      if (e.cd <= 0) {
        e.state = "windup";
        e.stateT = 0;
      } else e.state = "idle";
    } else {
      e.state = "move";
      this.moveToward(e, t.x - Math.sign(d) * reach * 0.8, dt);
    }
  }

  private aiArcher(e: Fighter, dt: number) {
    const t = this.pickTarget(e);
    if (!t) return;
    const dist = Math.abs(t.x - e.x);
    if (e.state === "draw") {
      e.draw = Math.min(1, e.stateT / 1.1);
      e.facing = t.x >= e.x ? 1 : -1;
      if (e.stateT >= e.cd2) {
        this.fireEnemyArrow(e, t.x, t.y - t.h * 0.55, this.targetVx(t));
        e.state = "recover";
        e.stateT = 0;
        e.draw = 0;
        e.cd = 1.4 + this.rng() * 1.2;
      }
      return;
    }
    const keepAway = this.drawing && t.kind === "fighter" && t.f.kind === "player" && dist < 700;
    if (dist < 500 || keepAway) {
      e.state = "move";
      this.moveToward(e, e.x + Math.sign(e.x - t.x || 1) * 200, dt, 0.9);
      e.facing = t.x >= e.x ? 1 : -1;
    } else if (dist > 800) {
      e.state = "move";
      this.moveToward(e, t.x + Math.sign(e.x - t.x) * 700, dt);
    } else e.state = "idle";
    if (e.cd <= 0 && dist < 1300) {
      e.state = "draw";
      e.stateT = 0;
      e.cd2 = 0.9 + this.rng() * 0.5;
    }
  }

  private aiShaman(e: Fighter, dt: number) {
    const t = this.pickTarget(e);
    if (!t) return;
    const dist = Math.abs(t.x - e.x);
    if (e.state === "cast") {
      if (e.stateT > 0.7) {
        e.state = "idle";
        e.stateT = 0;
      }
      return;
    }
    if (dist < 850) this.moveToward(e, e.x + Math.sign(e.x - t.x || 1) * 200, dt, 0.8);
    else if (dist > 1100) this.moveToward(e, t.x + Math.sign(e.x - t.x) * 950, dt);
    e.facing = t.x >= e.x ? 1 : -1;
    // heal lowest ally every 6s
    if (e.cd2 <= 0) {
      let low: Fighter | null = null;
      let lr = 0.95;
      for (const f of this.fighters) {
        if (!f.alive || f.team !== 1 || f.kind === "dummy") continue;
        const r = f.hp / f.maxHp;
        if (r < lr) {
          lr = r;
          low = f;
        }
      }
      e.cd2 = 6;
      if (low) {
        low.hp = Math.min(low.maxHp, low.hp + low.maxHp * 0.25);
        this.ring(low.x, low.y - low.h * 0.5, "#7EE05A", 14);
        this.floatText(low.x, low.y - low.h - 10, "HEAL", "#7EE05A", false);
        e.state = "cast";
        e.stateT = 0;
      }
    }
    if (e.cd <= 0 && dist < 1300) {
      this.fireEnemyArrow(e, t.x, t.y - t.h * 0.5, this.targetVx(t), { kind: "orb", speed: 760, errMul: 1.3 });
      e.cd = 4 + this.rng();
      e.state = "cast";
      e.stateT = 0;
    }
  }

  private aiChampion(e: Fighter, dt: number) {
    const p = this.player;
    if (!p.alive) return;
    const dist = Math.abs(p.x - e.x);
    // Dodge incoming player arrows
    if (e.state !== "draw" && e.cd2 <= 0) {
      const incoming = this.arrows.some((a) => a.alive && a.isPlayer && a.stuck === 0 && Math.abs(a.x - e.x) < 320 && Math.sign(e.x - a.x) === Math.sign(a.vx));
      if (incoming && this.rng() < 0.35 + 0.1 * this.diffMult) {
        e.vx += (e.x > p.x ? 1 : -1) * 520;
        e.cd2 = 1.6;
        e.anim += 2;
      }
    }
    if (e.state === "draw") {
      e.draw = Math.min(1, e.stateT / 0.9);
      e.facing = p.x >= e.x ? 1 : -1;
      if (e.stateT >= 0.8 + (1 - this.diffMult * 0.4) * 0.3) {
        this.fireEnemyArrow(e, p.x, p.y - p.h * 0.55, this.targetVx({ kind: "fighter", f: p, x: p.x, y: p.y, h: p.h }), { speed: 1050, errMul: 0.6, element: this.stage.dmgScale && this.stage.dmgScale > 1.2 ? "storm" : "normal" });
        e.state = "recover";
        e.stateT = 0;
        e.draw = 0;
        e.cd = 0.9 + this.rng() * 0.8;
      }
      return;
    }
    const want = 650 + Math.sin(this.t * 0.7 + e.id) * 180;
    if (Math.abs(dist - want) > 40) {
      e.state = "move";
      this.moveToward(e, p.x + Math.sign(e.x - p.x || 1) * want, dt);
    } else e.state = "idle";
    e.facing = p.x >= e.x ? 1 : -1;
    if (e.cd <= 0) {
      e.state = "draw";
      e.stateT = 0;
    }
  }

  private aiBoss(e: Fighter, dt: number) {
    const p = this.player;
    const pct = e.hp / e.maxHp;
    const prevPhase = e.phase;
    e.phase = pct > 0.7 ? 1 : pct > 0.4 ? 2 : 3;
    if (e.phase !== prevPhase) {
      this.emit("boss");
      this.floatText(e.x, e.y - e.h - 30, e.phase === 3 ? "ENRAGED!" : "PHASE 2", "#FF6B6B", true);
      this.shake = 10;
    }
    if (!e.summoned70 && pct <= 0.7) {
      e.summoned70 = true;
      this.spawnEnemy("grunt", clamp(e.x + 120, 300, this.worldW - 60), true);
      this.spawnEnemy("grunt", clamp(e.x + 200, 300, this.worldW - 60), true);
      this.floatText(e.x, e.y - e.h - 50, "SUMMONS THRALLS", "#FFB070", true);
    }
    if (e.phase === 3 && !e.enraged) e.enraged = true;
    const t = this.pickTarget(e) ?? (p.alive ? { kind: "fighter" as const, f: p, x: p.x, y: p.y, h: p.h } : null);
    if (!t) return;
    const dx = t.x - e.x;
    const dist = Math.abs(dx);

    switch (e.state) {
      case "draw":
        e.draw = Math.min(1, e.stateT / 0.8);
        e.facing = dx >= 0 ? 1 : -1;
        if (e.stateT >= 0.8) {
          const n = 3 + Math.floor(this.rng() * 3);
          this.fireEnemyArrow(e, t.x, t.y - t.h * 0.5, this.targetVx(t), { count: n, spread: 0.07, speed: 1000, errMul: 0.8 });
          e.state = "recover";
          e.stateT = 0;
          e.draw = 0;
        }
        return;
      case "charge-tell":
        if (e.stateT >= 0.7) {
          e.state = "charge";
          e.stateT = 0;
          e.targetId = dx >= 0 ? 1 : -1;
        }
        return;
      case "charge": {
        const dir = e.targetId >= 0 ? 1 : -1;
        e.x += dir * 680 * dt * (e.enraged ? 1.2 : 1);
        e.anim += dt * 16;
        for (const f of this.fighters) {
          if (!f.alive || f.team === e.team) continue;
          if (Math.abs(f.x - e.x) < (e.w + f.w) * 0.5 && f.hitFlash <= 0) this.damageFighter(f, e.dmg * 1.3, { knock: dir * 600 });
        }
        if (e.stateT > 1.0 || e.x < 80 || e.x > this.worldW - 80) {
          e.x = clamp(e.x, 80, this.worldW - 80);
          e.state = "recover";
          e.stateT = 0;
        }
        return;
      }
      case "slam-tell":
        if (e.stateT >= 0.9) {
          this.shockwaves.push({ x: e.x, r: 40, maxR: 460, dmg: e.dmg * 1.1, hitIds: [], team: e.team });
          this.shake = 14;
          this.emit("explosion");
          this.burst(e.x, GROUND_Y - 10, "dust", "#BBA58A", 30, 400, 600, 8);
          e.state = "recover";
          e.stateT = 0;
        }
        return;
      case "recover":
        if (e.stateT >= 0.8) {
          e.state = "idle";
          e.stateT = 0;
        }
        return;
    }

    // idle / move: keep distance, pick attack
    const want = e.phase === 1 ? 700 : 520;
    if (Math.abs(dist - want) > 60) {
      e.state = "move";
      this.moveToward(e, t.x - Math.sign(dx || 1) * want, dt);
    } else {
      e.state = "idle";
      e.facing = dx >= 0 ? 1 : -1;
    }
    if (e.cd <= 0) {
      e.cd = (e.phase === 1 ? 3 : 2.6) * (e.enraged ? 0.77 : 1);
      const roll = this.rng();
      if (e.phase === 1 || roll < 0.4) {
        e.state = "draw";
        e.stateT = 0;
      } else if (roll < 0.7) {
        e.state = "charge-tell";
        e.stateT = 0;
        const dir = dx >= 0 ? 1 : -1;
        this.addTelegraph("slam", e.x + dir * 400, 800, 0.7, 0, -1, e.team, 0.2);
      } else {
        e.state = "slam-tell";
        e.stateT = 0;
        this.addTelegraph("slam", e.x, 520, 0.9, 0, -1, e.team, 0.2);
      }
    }
    // Phase 3: arrow rain
    if (e.phase === 3 && e.cd2 <= 0) {
      e.cd2 = 6;
      for (let i = -1; i <= 1; i++) this.addTelegraph("rain", p.x + i * 170 + (this.rng() - 0.5) * 60, 110, 1.1, e.dmg * 0.6, 0.15, e.team);
    }
  }

  private updateFriendly(f: Fighter, dt: number) {
    if (dt === 0) return;
    f.stateT += dt;
    f.cd -= dt;
    if (f.kind === "escort") return this.aiEscort(f, dt);
    const p = this.player;
    const target = this.nearestEnemyOf(f, f.kind === "tank" ? 600 : 1150);
    if (f.kind === "tank") {
      if (target && Math.abs(target.x - p.x) < 900) {
        const d = target.x - f.x;
        if (Math.abs(d) > 56) {
          f.state = "move";
          this.moveToward(f, target.x - Math.sign(d) * 50, dt);
        } else {
          f.facing = d >= 0 ? 1 : -1;
          if (f.cd <= 0) {
            f.cd = ALLIES.tank.fireRate;
            f.state = "strike";
            f.stateT = 0;
            this.damageFighter(target, f.dmg * (f.buffT > 0 ? 1.15 : 1), { knock: f.facing * 200 });
          }
        }
      } else this.followPlayer(f, dt, 110);
      return;
    }
    // ranged allies
    const follow = f.kind === "scout" ? 70 : 150;
    if (target) {
      if (f.state === "draw") {
        f.draw = Math.min(1, f.stateT / 0.6);
        f.facing = target.x >= f.x ? 1 : -1;
        if (f.stateT >= 0.6) {
          const err = f.kind === "marksman" ? 0.4 : 1.1;
          this.fireEnemyArrow(f, target.x, target.y - target.h * 0.55, 0, { speed: f.kind === "marksman" ? 1150 : 950, errMul: err });
          f.state = "idle";
          f.stateT = 0;
          f.draw = 0;
          f.cd = (f.kind === "marksman" ? ALLIES.marksman.fireRate : ALLIES.scout.fireRate) * (0.85 + this.rng() * 0.3);
        }
        return;
      }
      this.followPlayer(f, dt, follow);
      if (f.cd <= 0) {
        f.state = "draw";
        f.stateT = 0;
      }
    } else this.followPlayer(f, dt, follow);
  }

  private followPlayer(f: Fighter, dt: number, gap: number) {
    const p = this.player;
    const tx = p.x - p.facing * gap;
    if (Math.abs(tx - f.x) > 30) {
      f.state = "move";
      this.moveToward(f, tx, dt);
    } else {
      f.state = "idle";
      f.facing = p.facing;
    }
  }

  private aiEscort(f: Fighter, dt: number) {
    const danger = this.fighters.some((e) => e.alive && e.team === 1 && e.aggro && Math.abs(e.x - f.x) < 450);
    const tooFar = f.x - this.player.x > 420;
    f.cower = danger;
    if (!danger && !tooFar) {
      f.state = "move";
      this.moveToward(f, this.worldW, dt);
    } else f.state = "idle";
  }

  // -------------------------------------------------------------------------
  // Projectiles

  private updateArrows(dt: number) {
    for (const a of this.arrows) {
      if (!a.alive) continue;
      if (a.stuck > 0) {
        a.stuck -= dt;
        if (a.stuck <= 0) a.alive = false;
        continue;
      }
      a.age += dt;
      const steps = 3;
      const sdt = dt / steps;
      for (let s = 0; s < steps && a.alive && a.stuck === 0; s++) {
        const x0 = a.x;
        const y0 = a.y;
        a.vx += this.wind * a.windMul * sdt;
        a.vy += (a.kind === "orb" ? G * 0.8 : G) * sdt;
        a.x += a.vx * sdt;
        a.y += a.vy * sdt;
        this.collideArrow(a, x0, y0);
      }
      if (!a.alive) continue;
      a.trail.push({ x: a.x, y: a.y });
      if (a.trail.length > 7) a.trail.shift();
      if (a.y >= GROUND_Y && a.stuck === 0) {
        a.y = GROUND_Y;
        if (a.kind === "orb") {
          this.burst(a.x, a.y - 4, "drop", "#7EE05A", 10, 160, 400);
          a.alive = false;
        } else {
          a.stuck = 3;
          if (a.kind === "rain") a.stuck = 0.8;
        }
        this.resolveMiss(a);
      } else if (a.x < -300 || a.x > this.worldW + 300 || a.age > 8) {
        a.alive = false;
        this.resolveMiss(a);
      }
    }
    if (this.arrows.length > 120) this.arrows = this.arrows.filter((a) => a.alive);
  }

  /** Close one arrow of a volley; when the whole volley is resolved, judge hit vs miss. */
  private settleVolley(a: Arrow, hit: boolean) {
    const v = this.volleys.get(a.volley);
    if (!v) return;
    v.left -= 1;
    if (hit) {
      if (!v.hit) {
        this.streak += 1;
        this.bestStreak = Math.max(this.bestStreak, this.streak);
        if (this.streak >= 3) {
          const bonus = Math.min(100, this.streak * 10);
          this.streakBonus += bonus;
          if (this.streak % 3 === 0) this.floatText(this.player.x, this.player.y - this.player.h - 40, `STREAK ×${this.streak}`, "#E3B341", false);
        }
      }
      v.hit = true;
    }
    if (v.left <= 0) {
      if (!v.hit) {
        this.misses += 1;
        this.streak = 0;
      }
      this.volleys.delete(a.volley);
    }
  }

  private resolveMiss(a: Arrow) {
    if (!a.isPlayer || a.scored) return;
    a.scored = true;
    this.settleVolley(a, a.hitIds.length > 0);
  }

  private scorePlayerHit(a: Arrow) {
    if (a.scored) return;
    a.scored = true;
    this.hits += 1;
    this.settleVolley(a, true);
  }

  private collideArrow(a: Arrow, x0: number, y0: number) {
    // fighters
    for (const f of this.fighters) {
      if (!f.alive || f.team === a.team || a.hitIds.includes(f.id)) continue;
      if (f.kind === "dummy" && a.team !== 0) continue;
      const minX = f.x - f.w / 2;
      const maxX = f.x + f.w / 2;
      const minY = f.y - f.h;
      const t = segmentAabb(x0, y0, a.x, a.y, minX, minY, maxX, f.y);
      if (t < 0) continue;
      const hy = y0 + (a.y - y0) * t;
      const hx = x0 + (a.x - x0) * t;
      const head = hy < minY + f.h * HEADSHOT_ZONE;
      // shields block frontal non-headshots
      if (f.shield && !head && !a.power) {
        const frontal = Math.sign(a.vx) === -f.facing;
        const blockChance = f.kind === "dummy" ? 1 : 0.35;
        if (frontal && this.rng() < blockChance) {
          this.emit("blocked");
          this.floatText(f.x, f.y - f.h - 10, "BLOCK", "#C9CED9", false);
          this.burst(hx, hy, "spark", "#E6E9F0", 8, 260, 600, 3);
          a.vx = -a.vx * 0.25;
          a.vy = -200;
          a.hitIds.push(f.id);
          a.alive = false;
          if (a.isPlayer && !a.scored) {
            a.scored = true;
            this.hits += 1; // contact, not a miss — but it breaks the streak
            this.streak = 0;
            const v = this.volleys.get(a.volley);
            if (v) {
              v.hit = true;
              this.settleVolley(a, false);
            }
          }
          return;
        }
      }
      a.hitIds.push(f.id);
      let dmg = a.damage;
      let crit: "head" | "crit" | undefined;
      if (a.isPlayer) {
        if (head) {
          crit = "head";
          dmg *= 2;
          this.headshots += 1;
          this.emit("crit");
        } else {
          const extra = this.focusT > 0 && this.cfg.player.klass === "stalker" ? 0.25 : 0;
          if (this.rng() < this.cfg.player.critChance + extra) {
            crit = "crit";
            dmg *= 1.5;
            this.emit("crit");
          } else this.emit("hit");
        }
        if (Math.abs(hx - a.fromX) > 600 && f.team === 1) {
          this.longShots += 1;
          this.floatText(f.x, f.y - f.h - 46, "LONG SHOT +30", "#8FD3FF", false);
        }
        this.scorePlayerHit(a);
      } else {
        if (head && a.team === 0) dmg *= 1.5;
        this.emit("hit");
      }
      if (f.kind === "dummy" && !head && !a.power) dmg = 0;
      const knock = Math.sign(a.vx) * (140 + (a.isPlayer ? this.cfg.player.power * 7 : 0));
      this.burst(hx, hy, "spark", crit ? "#FFD24A" : "#FFFFFF", crit ? 10 : 5, 220, 700, 3);
      if (dmg > 0) {
        this.damageFighter(f, dmg, { crit, byPlayer: a.isPlayer, knock, element: a.element });
        if (a.element !== "normal") this.applyElement(f, a.element, a.isPlayer);
      } else {
        this.floatText(f.x, f.y - f.h - 10, "AIM HIGHER", "#C9CED9", false);
        this.emit("blocked");
      }
      if (a.pierce > 0) a.pierce -= 1;
      else {
        a.alive = false;
        return;
      }
    }
    // freed hostages (player stray arrows & enemy arrows; allies are careful)
    if (a.isPlayer || a.team === 1) {
      for (const h of this.hostages) {
        if (!h.freed || !h.alive || h.saved || h.freedAge < 0.8 || a.hitIds.includes(h.id)) continue;
        const t = segmentAabb(x0, y0, a.x, a.y, h.x - 18, h.y - 80, h.x + 18, h.y);
        if (t < 0) continue;
        a.hitIds.push(h.id);
        this.damageHostage(h, Math.min(a.damage * (a.isPlayer ? 0.5 : 1), h.maxHp * 0.45));
        if (a.isPlayer && !a.scored) {
          a.scored = true;
          this.streak = 0;
          this.settleVolley(a, false);
        }
        a.alive = false;
        return;
      }
    }
    // props
    for (const pr of this.props) {
      if (!pr.alive || a.hitIds.includes(pr.id)) continue;
      if (a.team === 0 && pr.kind === "gate") continue;
      if (a.team === 1 && pr.kind !== "gate") continue;
      const t = segmentAabb(x0, y0, a.x, a.y, pr.x - pr.w / 2, pr.y - pr.h, pr.x + pr.w / 2, pr.y);
      if (t < 0) continue;
      a.hitIds.push(pr.id);
      if (a.isPlayer) this.scorePlayerHit(a);
      this.emit(pr.kind === "cage" ? "blocked" : "hit");
      this.damageProp(pr, a.damage, a.isPlayer);
      a.alive = false;
      return;
    }
  }

  // -------------------------------------------------------------------------
  // Hostages, pickups

  private updateHostages(dt: number) {
    for (const h of this.hostages) {
      h.hitFlash = Math.max(0, h.hitFlash - dt);
      if (!h.alive || h.saved) continue;
      h.anim += dt * (h.freed ? 10 : 2);
      if (!h.freed) continue;
      h.freedAge += dt;
      const safeX = Math.max(140, this.player.x - 260);
      if (h.x > safeX) h.x -= 150 * dt;
      else {
        h.t += dt;
        if (h.t > 1.2) {
          h.saved = true;
          this.hostagesSaved += 1;
          this.floatText(h.x, h.y - 110, "SAVED!", "#6EE7A0", true);
          this.emit("pickup");
        }
      }
    }
  }

  private updatePickups(dt: number) {
    const p = this.player;
    for (const k of this.pickups) {
      if (!k.alive) continue;
      k.t += dt;
      const dx = p.x - k.x;
      const dy = p.y - 50 - k.y;
      const d = Math.hypot(dx, dy);
      if (k.t > 0.5 && d < 260 && p.alive) {
        k.vx += (dx / d) * 2400 * dt;
        k.vy += (dy / d) * 2400 * dt;
        k.vx *= 0.9;
        k.vy *= 0.9;
      } else {
        k.vy += G * 0.8 * dt;
      }
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      if (k.y > GROUND_Y - 8) {
        k.y = GROUND_Y - 8;
        k.vy = -k.vy * 0.3;
        k.vx *= 0.8;
      }
      if (d < 50 && p.alive && k.t > 0.3) {
        k.alive = false;
        if (k.kind === "gold") {
          this.goldFound += k.value;
          this.floatText(p.x, p.y - p.h - 10, `+${k.value}g`, "#F2C94C", false);
        } else this.heal(p, k.value);
        this.emit("pickup");
      }
      if (k.t > 14) k.alive = false;
    }
    if (this.pickups.length > 60) this.pickups = this.pickups.filter((k) => k.alive);
  }

  // -------------------------------------------------------------------------
  // Hazards, telegraphs, shockwaves

  private addTelegraph(kind: TelegraphKind, x: number, w: number, t: number, dmg: number, active: number, team: Team | -1, visualActive?: number) {
    this.telegraphs.push({ id: nid(), kind, x, w, t, total: t, fired: false, active: visualActive ?? active, dmg, team });
  }

  private updateHazards(dt: number) {
    const s = this.stage;
    if (s.hazard !== "none" && this.introT <= 0 && s.type !== "training") {
      this.hazardT -= dt;
      if (this.hazardT <= 0) {
        const px = this.player.x + (this.rng() - 0.3) * 600;
        const x = clamp(px, 120, this.worldW - 120);
        if (s.hazard === "geysers") {
          this.addTelegraph("geyser", x, 90, 1.2, 25 * this.dmgScale * 0.8, 0.6, -1);
          this.hazardT = 5 + this.rng() * 2.5;
        } else if (s.hazard === "blizzard") {
          this.addTelegraph("icicle", x, 56, 1.0, 20 * this.dmgScale * 0.8, 0.25, -1);
          if (this.rng() < 0.5) this.addTelegraph("icicle", clamp(x + 180, 120, this.worldW - 120), 56, 1.2, 20 * this.dmgScale * 0.8, 0.25, -1);
          this.hazardT = 3.5 + this.rng() * 2;
        } else if (s.hazard === "lightning") {
          this.addTelegraph("lightning", x, 74, 1.3, 35 * this.dmgScale * 0.8, 0.3, -1);
          this.hazardT = 4.5 + this.rng() * 2;
        }
      }
    }
    for (const tg of this.telegraphs) {
      if (!tg.fired) {
        tg.t -= dt;
        if (tg.t <= 0) {
          tg.fired = true;
          this.fireTelegraph(tg);
        }
      } else {
        tg.active -= dt;
      }
    }
    this.telegraphs = this.telegraphs.filter((tg) => !tg.fired || tg.active > 0);

    for (const sw of this.shockwaves) {
      sw.r += 720 * dt;
      for (const f of this.fighters) {
        if (!f.alive || f.team === sw.team || sw.hitIds.includes(f.id)) continue;
        if (f.y < GROUND_Y - 30) continue; // jumped / airborne
        const d = Math.abs(f.x - sw.x);
        if (Math.abs(d - sw.r) < 36) {
          sw.hitIds.push(f.id);
          this.damageFighter(f, sw.dmg, { knock: Math.sign(f.x - sw.x) * 380 });
          f.vy = -320;
        }
      }
    }
    this.shockwaves = this.shockwaves.filter((sw) => sw.r < sw.maxR);
  }

  private fireTelegraph(tg: Telegraph) {
    const inZone = (x: number) => Math.abs(x - tg.x) < tg.w / 2;
    if (tg.kind === "rain") {
      for (let i = 0; i < 5; i++) {
        const x = tg.x + (this.rng() - 0.5) * tg.w;
        this.arrows.push({ id: nid(), ownerId: -1, team: tg.team === -1 ? 1 : tg.team, kind: "rain", x: x - 60, y: -40 - this.rng() * 120, vx: 60, vy: 900, element: "normal", damage: tg.dmg, pierce: 0, hitIds: [], trail: [], alive: true, stuck: 0, age: 0, fromX: x, isPlayer: false, power: false, scored: false, windMul: 0.2, volley: 0 });
      }
      return;
    }
    if (tg.kind === "slam") return; // visual only (boss handles damage)
    if (tg.kind === "geyser") {
      this.burst(tg.x, GROUND_Y - 10, "ember", "#FF8A3D", 34, 520, 500, 6);
      this.shake = Math.max(this.shake, 6);
      this.emit("explosion");
    } else if (tg.kind === "icicle") {
      this.burst(tg.x, GROUND_Y - 10, "shard", "#DFF3FF", 16, 300, 900, 4);
      this.emit("blocked");
    } else if (tg.kind === "lightning") {
      this.bolts.push({ x1: tg.x + (this.rng() - 0.5) * 80, y1: 0, x2: tg.x, y2: GROUND_Y, life: 0.3 });
      this.burst(tg.x, GROUND_Y - 10, "spark", "#E8DDFF", 24, 420, 600, 4);
      this.shake = Math.max(this.shake, 8);
      this.emit("explosion");
    }
    for (const f of this.fighters) {
      if (!f.alive || !inZone(f.x)) continue;
      if (tg.team !== -1 && f.team === tg.team) continue;
      this.damageFighter(f, tg.dmg, { knock: 0 });
      if (tg.kind === "geyser") f.vy = -620;
    }
    for (const h of this.hostages) if (h.freed && h.alive && !h.saved && inZone(h.x)) this.damageHostage(h, tg.dmg * 0.5);
  }

  // -------------------------------------------------------------------------
  // Spawning (waves / survival / co-op adds)

  private aliveEnemies() {
    return this.fighters.filter((f) => f.alive && f.team === 1);
  }

  private spawnWave(spawns: { kind: EnemyKind; count: number }[]) {
    const s = this.stage;
    let i = 0;
    for (const sp of spawns) {
      for (let k = 0; k < sp.count; k++) {
        const x =
          s.type === "defense"
            ? this.worldW - 80 - i * 55 - this.rng() * 60
            : clamp(this.player.x + 900 + i * 60 + this.rng() * 250, 400, this.worldW - 60);
        const e = this.spawnEnemy(sp.kind, x, true);
        if (sp.kind === "archer" || sp.kind === "shaman") e.x = clamp(e.x + 150, 300, this.worldW - 40);
        i++;
      }
    }
    this.emit("wave", `Wave ${this.waveIndex}`);
    this.floatText(this.player.x + 300, 300, `WAVE ${this.waveIndex}`, "#E3B341", true);
  }

  private survivalSpawns(n: number): { kind: EnemyKind; count: number }[] {
    const out: { kind: EnemyKind; count: number }[] = [{ kind: "grunt", count: 2 + Math.floor(n * 0.7) }];
    if (n >= 2) out.push({ kind: "archer", count: 1 + Math.floor(n / 3) });
    if (n >= 3) out.push({ kind: "shield", count: Math.floor(n / 3) });
    if (n >= 4) out.push({ kind: "shaman", count: Math.floor(n / 4) });
    return out;
  }

  private updateSpawns(dt: number) {
    const s = this.stage;
    if (this.introT > 0) return;
    if (s.type === "defense" || s.type === "waves") {
      const alive = this.aliveEnemies().length;
      if (alive === 0 && this.waveIndex < s.groups.length) {
        this.waveTimer -= dt;
        if (this.waveTimer <= 0) {
          const g = s.groups[this.waveIndex];
          this.waveIndex += 1;
          this.spawnWave(g.spawns);
          this.waveTimer = s.groups[this.waveIndex]?.delay ?? 3;
        }
      }
    } else if (s.type === "survival") {
      if (this.aliveEnemies().length === 0) {
        this.waveTimer -= dt;
        if (this.waveTimer <= 0) {
          this.waveIndex += 1;
          this.survivalWave = this.waveIndex;
          // survival scaling: each wave a bit tougher
          this.spawnWave(this.survivalSpawns(this.waveIndex));
          for (const e of this.aliveEnemies()) {
            const m = 1 + 0.08 * (this.waveIndex - 1);
            e.maxHp *= m;
            e.hp = e.maxHp;
            e.dmg *= 1 + 0.05 * (this.waveIndex - 1);
          }
          this.waveTimer = 3;
        }
      }
    } else if (s.type === "coop" && this.boss && this.boss.alive) {
      this.coopAddT -= dt;
      if (this.coopAddT <= 0) {
        this.coopAddT = 14;
        this.spawnEnemy("grunt", clamp(this.boss.x + 150, 300, this.worldW - 60), true);
        this.spawnEnemy(this.rng() < 0.5 ? "archer" : "grunt", clamp(this.boss.x + 260, 300, this.worldW - 60), true);
      }
    }
  }

  // -------------------------------------------------------------------------
  // FX

  private updateFx(dt: number) {
    for (const pt of this.particles) {
      pt.life -= dt;
      pt.vy += pt.gravity * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.y > GROUND_Y && pt.gravity > 0) {
        pt.y = GROUND_Y;
        pt.vy *= -0.3;
        pt.vx *= 0.6;
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= (f.big ? 40 : 60) * dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const b of this.bolts) b.life -= dt;
    this.bolts = this.bolts.filter((b) => b.life > 0);
    for (const pr of this.props) {
      pr.hitFlash = Math.max(0, pr.hitFlash - dt);
      if (pr.swing > 0) pr.swing = Math.max(0, pr.swing - dt * 0.6);
    }
    this.updateRagdolls(dt);
    this.shake = Math.max(0, this.shake - dt * 30);
  }

  private updateRagdolls(dt: number) {
    const g = G * dt * dt;
    for (const r of this.ragdolls) {
      r.life -= dt;
      for (const n of r.nodes) {
        const vx = (n.x - n.px) * 0.99;
        const vy = (n.y - n.py) * 0.99;
        n.px = n.x;
        n.py = n.y;
        n.x += vx;
        n.y += vy + g;
        if (n.y > GROUND_Y) {
          n.y = GROUND_Y;
          const vyb = n.y - n.py;
          n.py = n.y + vyb * 0.35; // bounce
          n.px = n.x - (n.x - n.px) * 0.6; // friction
        }
      }
      for (let it = 0; it < 4; it++) {
        for (const [a, b, len] of r.sticks) {
          const na = r.nodes[a];
          const nb = r.nodes[b];
          const dx = nb.x - na.x;
          const dy = nb.y - na.y;
          const d = Math.hypot(dx, dy) || 0.0001;
          const diff = ((d - len) / d) * 0.5;
          na.x += dx * diff;
          na.y += dy * diff;
          nb.x -= dx * diff;
          nb.y -= dy * diff;
        }
      }
      for (const n of r.nodes) if (n.y > GROUND_Y) n.y = GROUND_Y;
    }
    this.ragdolls = this.ragdolls.filter((r) => r.life > 0);
  }

  /** Update camera for a visible world width. */
  updateCamera(visibleW: number) {
    const target = clamp(this.player.x - visibleW * 0.35, 0, Math.max(0, this.worldW - visibleW));
    this.camX += (target - this.camX) * 0.12;
    if (Math.abs(target - this.camX) > visibleW) this.camX = target;
  }

  // -------------------------------------------------------------------------
  // Win / lose

  private checkEnd() {
    const s = this.stage;
    const p = this.player;
    if (!p.alive) return this.finish(false);
    if (s.type === "survival") return;
    const enemiesLeft = this.fighters.some((f) => f.alive && f.team === 1);
    switch (s.type) {
      case "clear":
        if (!enemiesLeft) this.finish(true);
        break;
      case "rescue": {
        const resolved = this.hostages.every((h) => !h.alive || h.saved);
        const anySaved = this.hostages.some((h) => h.saved);
        if (this.hostages.every((h) => !h.alive)) this.finish(false);
        else if (resolved && anySaved && !enemiesLeft) this.finish(true);
        break;
      }
      case "escort":
        if (this.escort && !this.escort.alive) this.finish(false);
        else if (this.escort && this.escort.x >= this.worldW - 220) this.finish(true);
        break;
      case "defense":
        if (this.gate && !this.gate.alive) this.finish(false);
        else if (this.waveIndex >= s.groups.length && !enemiesLeft) this.finish(true);
        break;
      case "waves":
        if (this.waveIndex >= s.groups.length && !enemiesLeft) this.finish(true);
        break;
      case "boss":
      case "coop":
        if (this.boss && !this.boss.alive) this.finish(true);
        break;
      case "duel":
        if (!enemiesLeft) this.finish(true);
        break;
      case "training":
        if (s.drill === "guard" ? this.dummiesBroken >= 3 : this.props.filter((x) => x.kind === "bell").every((b) => !b.alive)) this.finish(true);
        break;
    }
  }

  private finish(victory: boolean) {
    if (this.over) return;
    this.over = true;
    this.victory = victory;
    this.drawing = false;
    this.focusT = 0;
    this.result = this.computeResult(victory);
    this.emit(victory || this.stage.type === "survival" ? "victory" : "defeat");
  }

  /** Abandon mission (pause → quit). */
  forfeit() {
    if (!this.over) this.finish(false);
  }

  private secretDone(victory: boolean): boolean {
    const sec = this.stage.secret;
    if (!victory || !sec) return false;
    switch (sec) {
      case "noMiss":
        return this.misses === 0 && this.shots > 0;
      case "noDamageTaken":
        return this.damageTaken < 0.5;
      case "gateFull":
        return !!this.gate && this.gate.hp >= this.gate.maxHp;
      case "speedRun120":
        return this.time < 120;
      case "allCagesFirst":
        return this.freedAllBeforeKill;
    }
  }

  computeResult(victory: boolean): EngineResult {
    const s = this.stage;
    const lines: ScoreLine[] = [];
    const gatePct = this.gate ? Math.round((this.gate.hp / this.gate.maxHp) * 100) : 100;
    const hpPct = Math.round((Math.max(0, this.player.hp) / this.player.maxHp) * 100);
    const secret = this.secretDone(victory);
    let score = 0;
    let stars: [boolean, boolean, boolean] = [victory, false, false];

    if (s.type === "survival") {
      const wave = Math.max(1, this.survivalWave);
      score = Math.round(this.kills * wave * this.diffMult * 10);
      lines.push({ label: `Kills ${this.kills} × Wave ${wave}`, value: this.kills * wave * 10 });
      lines.push({ label: `Difficulty ×${this.diffMult}`, value: score - this.kills * wave * 10 });
      stars = [wave >= 3, wave >= 6, wave >= 10];
    } else if (s.type === "duel") {
      const champ = this.fighters.find((f) => f.kind === "champion");
      const enemyPct = champ ? champ.hp / champ.maxHp : 0;
      if (victory) {
        const hpScore = hpPct * 10;
        const timeBonus = Math.max(0, Math.round(600 - this.time * 5));
        lines.push({ label: `Remaining HP ${hpPct}%`, value: hpScore });
        lines.push({ label: "Time bonus", value: timeBonus });
        score = hpScore + timeBonus;
      } else {
        score = Math.round((1 - enemyPct) * 300);
        lines.push({ label: "Damage dealt", value: score });
      }
      stars = [victory, victory && hpPct >= 50, victory && this.time <= 45];
    } else if (s.type === "training") {
      const targets = 3;
      if (victory) {
        score = Math.max(100, 1000 - Math.max(0, this.shots - targets) * 80 - Math.floor(this.time) * 4);
        lines.push({ label: `Arrows used: ${this.shots}`, value: score });
      }
      stars = [victory, victory && this.shots <= targets + 3, victory && this.shots <= targets + 1];
    } else {
      const killPts = this.kills * 100;
      lines.push({ label: `Kills ×${this.kills}`, value: killPts });
      if (this.headshots) lines.push({ label: `Headshots ×${this.headshots}`, value: this.headshots * 50 });
      if (this.longShots) lines.push({ label: `Long shots ×${this.longShots}`, value: this.longShots * 30 });
      if (this.streakBonus) lines.push({ label: `Streak bonus (best ×${this.bestStreak})`, value: this.streakBonus });
      if (this.hostagesFreed) lines.push({ label: `Hostages freed ×${this.hostagesFreed}`, value: this.hostagesFreed * 150 });
      if (this.hostagesLost) lines.push({ label: `Hostages lost ×${this.hostagesLost}`, value: -300 * this.hostagesLost });
      if (this.gate) lines.push({ label: `Gate integrity ${gatePct}%`, value: gatePct * 5 });
      if (victory) {
        const tb = Math.max(0, Math.round((s.parTime - this.time) * 5));
        if (tb) lines.push({ label: "Time bonus", value: tb });
      }
      if (secret) lines.push({ label: "Secret objective", value: 500 });
      score = Math.max(0, lines.reduce((a, l) => a + l.value, 0));
      if (s.type === "coop" && !victory) {
        // Lost co-op runs score like a lost duel: damage dealt to the boss, capped at 300.
        const bossPct = this.boss ? Math.max(0, this.boss.hp) / this.boss.maxHp : 1;
        score = Math.round((1 - bossPct) * 300);
        lines.length = 0;
        lines.push({ label: "Damage dealt to boss", value: score });
      }
      let second = false;
      if (s.type === "rescue") second = this.hostagesLost === 0;
      else if (s.type === "defense") second = gatePct >= 50;
      else second = this.time <= s.parTime;
      stars = [victory, victory && second, victory && secret];
    }

    // Arena boards are shared across difficulties: scale every non-survival arena score
    // by the difficulty multiplier (survival already includes it).
    if (s.scoreMode && s.type !== "survival" && score > 0 && this.diffMult !== 1) {
      const scaled = Math.round(score * this.diffMult);
      lines.push({ label: `Difficulty ×${this.diffMult}`, value: scaled - score });
      score = scaled;
    }
    return {
      victory,
      score,
      breakdown: lines,
      kills: this.kills,
      headshots: this.headshots,
      shots: this.shots,
      hits: this.hits,
      hostagesSaved: this.hostagesSaved,
      hostagesLost: this.hostagesLost,
      gatePct,
      time: Math.round(this.time),
      stars,
      secretDone: secret,
      wave: this.survivalWave || this.waveIndex,
      damageTaken: Math.round(this.damageTaken),
      hpPct,
    };
  }

  // -------------------------------------------------------------------------
  // HUD snapshot

  hud(): HudSnapshot {
    const s = this.stage;
    const lo = this.cfg.player;
    let progress = "";
    const enemiesLeft = this.fighters.filter((f) => f.alive && f.team === 1).length;
    switch (s.type) {
      case "clear":
      case "duel":
        progress = `${enemiesLeft} foe${enemiesLeft === 1 ? "" : "s"} left`;
        break;
      case "rescue":
        progress = `${this.hostagesSaved}/${this.hostages.length} saved · ${enemiesLeft} ${enemiesLeft === 1 ? "foe" : "foes"}`;
        break;
      case "escort":
        progress = this.escort ? `${Math.round((this.escort.x / (this.worldW - 220)) * 100)}% of the way` : "";
        break;
      case "defense":
      case "waves":
        progress = `Wave ${this.waveIndex}/${s.groups.length} · ${enemiesLeft} ${enemiesLeft === 1 ? "foe" : "foes"}`;
        break;
      case "survival":
        progress = `Wave ${this.survivalWave} · ${this.kills} kills`;
        break;
      case "boss":
      case "coop":
        progress = `${enemiesLeft} ${enemiesLeft === 1 ? "foe" : "foes"}`;
        break;
      case "training":
        progress = s.drill === "guard" ? `${this.dummiesBroken}/3 broken · ${this.shots} arrows` : `${this.bellsRung}/3 bells · ${this.shots} arrows`;
        break;
    }
    const partial = this.computeResultPreviewScore();
    return {
      hp: Math.max(0, this.player.hp),
      maxHp: this.player.maxHp,
      draw: this.player.draw,
      drawing: this.drawing,
      wind: this.wind,
      element: this.element,
      abilities: lo.abilities.map((id) => ({
        id,
        cd: this.cds[id],
        max: abilityCooldown(id, lo.klass),
        armed: (id === "multishot" && this.multishotArmed) || (id === "powershot" && this.powershotArmed),
        active: (id === "focus" && this.focusT > 0) || (id === "warcry" && this.warcryT > 0),
      })),
      objective: s.objective,
      progress,
      hostages: this.hostages.map((h) => ({ alive: h.alive, freed: h.freed, saved: h.saved })),
      boss: this.boss ? { name: this.boss.name, title: s.boss?.title ?? "", hp: Math.max(0, this.boss.hp), maxHp: this.boss.maxHp, phase: this.boss.phase } : null,
      gate: this.gate ? { hp: Math.max(0, this.gate.hp), maxHp: this.gate.maxHp } : null,
      escort: this.escort ? { hp: Math.max(0, this.escort.hp), maxHp: this.escort.maxHp, progress: this.escort.x / (this.worldW - 220) } : null,
      wave: this.waveIndex,
      score: partial,
      time: this.time,
      streak: this.streak,
      introCard: this.introCard,
      focus: this.focusT > 0,
      over: this.over,
      allies: this.fighters
        .filter((f) => f.kind === "scout" || f.kind === "marksman" || f.kind === "tank")
        .map((f) => ({ kind: f.kind as AllyType, hp: Math.max(0, f.hp), maxHp: f.maxHp, alive: f.alive })),
    };
  }

  private computeResultPreviewScore(): number {
    if (this.stage.type === "survival") return Math.round(this.kills * Math.max(1, this.survivalWave) * this.diffMult * 10);
    return Math.max(0, this.kills * 100 + this.headshots * 50 + this.longShots * 30 + this.streakBonus + this.hostagesFreed * 150 - this.hostagesLost * 300);
  }
}
