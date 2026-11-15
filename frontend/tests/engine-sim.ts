/**
 * Headless engine simulation: an aim-bot plays every mission and we assert each is winnable
 * and the core systems (wind, ragdolls, cages, barrels, scoring, stars) behave.
 * Run: yarn test:engine
 */
import { Engine, G, GROUND_Y, solveLaunchAngle } from "../src/game/engine";
import { ALL_STAGES } from "../src/game/missions";
import { buildLoadout } from "../src/game/rpg";
import type { Difficulty, StageDef } from "../src/game/types";

function makeEngine(stage: StageDef, level: number, difficulty: Difficulty = "normal", seed = 7) {
  const player = buildLoadout({
    name: "Bot", level, klass: "ranger",
    attrs: { power: level, precision: level, agility: level, vitality: level },
    bowId: level >= 8 ? "frostbite_longbow" : level >= 4 ? "rangers_recurve" : "hunter_shortbow",
    armorId: "ranger_mail", element: level >= 6 ? "storm" : "fire", drillStars: 3,
  });
  const allies = stage.type === "coop" ? (["marksman", "tank"] as const) : stage.type === "duel" || stage.type === "training" ? [] : (["marksman"] as const);
  return new Engine({ stage, difficulty, player, allies: [...allies], tutorial: false, seed });
}

/** Simple bot. Returns the engine after the run. */
function play(e: Engine, maxSeconds = 400) {
  const dt = 1 / 60;
  let shotTimer = 0;
  for (let i = 0; i < maxSeconds * 60 && !e.over; i++) {
    const p = e.player;
    // choose target: cages first (rescue), bells, enemies (nearest), then advance
    let tx: number | null = null;
    let ty = 0;
    const cage = e.props.find((pr) => pr.alive && (pr.kind === "cage" || pr.kind === "bell"));
    const enemy = e.fighters.filter((f) => f.alive && f.team === 1).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    if (cage && Math.abs(cage.x - p.x) < 1200) { tx = cage.x; ty = cage.y - cage.h * 0.5; }
    else if (enemy && Math.abs(enemy.x - p.x) < 1250 && enemy.aggro) {
      tx = enemy.x; ty = enemy.y - enemy.h * (enemy.kind === "dummy" || enemy.shield ? 0.92 : 0.55);
    }
    // movement
    let move: -1 | 0 | 1 = 0;
    const goal = e.escort ? e.escort.x + 150 : cage ? cage.x - 650 : enemy ? enemy.x - 750 : p.x;
    if (tx === null || Math.abs((tx ?? p.x) - p.x) > 900) move = goal > p.x + 30 ? 1 : goal < p.x - 30 ? -1 : 0;
    if (enemy && Math.abs(enemy.x - p.x) < 260 && (enemy.kind === "grunt" || enemy.kind === "shield" || enemy.kind === "boss")) move = -1; // kite
    e.setMove(move);
    if (tx !== null) {
      shotTimer -= dt;
      if (!e.drawing && shotTimer <= 0) e.beginDraw();
      if (e.drawing) {
        const o = e.bowOrigin(p);
        const v = e.arrowSpeed(1);
        const dx = tx - o.x;
        const t = Math.abs(dx) / (v * 0.8);
        const windShift = 0.5 * e.wind * (1 - e.cfg.player.windResist) * t * t;
        const adx = dx - windShift;
        e.setFacing(adx >= 0 ? 1 : -1);
        const ang = solveLaunchAngle(Math.max(30, Math.abs(adx)), o.y - ty, v, G) ?? 0.7;
        e.aim = ang;
        if (p.draw >= 1) { e.releaseDraw(); shotTimer = 0.15; }
      }
    } else if (e.drawing) e.cancelDraw();
    // abilities when available
    if (enemy && i % 120 === 0) for (let s = 0; s < 4; s++) e.useAbility(s);
    e.updateCamera(1600);
    e.update(dt);
    e.drainEvents();
  }
  return e;
}

let failures = 0;
const rows: string[] = [];
for (const stage of ALL_STAGES) {
  const level = Math.max(stage.recLevel + 2, 3);
  let wins = 0;
  let last: Engine | null = null;
  const SEEDS = [1, 2, 3];
  for (const seed of SEEDS) {
    const e = play(makeEngine(stage, level, "normal", seed));
    const r = e.result;
    if (stage.type === "survival" ? (r?.wave ?? 0) >= 3 : r?.victory) wins++;
    last = e;
  }
  const r = last!.result;
  const ok = wins > 0; // winnable
  if (!ok) failures++;
  rows.push(`${ok ? "PASS" : "FAIL"} ${stage.id.padEnd(20)} ${stage.type.padEnd(9)} lv${String(level).padEnd(3)} bot-wins=${wins}/${SEEDS.length} t=${String(r?.time ?? "-").padEnd(4)} score=${String(r?.score ?? "-").padEnd(6)} kills=${r?.kills ?? "-"} shots=${r?.shots} hits=${r?.hits} stars=${r?.stars.map((x) => (x ? "★" : "☆")).join("")}`);
}
console.log(rows.join("\n"));

// --- focused unit checks ---
function assert(cond: unknown, msg: string) { if (!cond) { failures++; console.log("FAIL", msg); } else console.log("ok  ", msg); }
{
  // wind deflects arrows
  const st = { ...ALL_STAGES.find((s) => s.id === "training_wind")! };
  const a = makeEngine({ ...st, windBase: 0, windVar: 0 }, 5); a.beginDraw(); a.player.draw = 1; a.aim = 0.6; a.releaseDraw();
  const b = makeEngine({ ...st, windBase: 120, windVar: 0 }, 5); b.beginDraw(); b.player.draw = 1; b.aim = 0.6; b.releaseDraw();
  for (let i = 0; i < 40; i++) { a.update(1 / 60); b.update(1 / 60); }
  assert(b.arrows[0].x > a.arrows[0].x + 5, `tailwind carries the arrow further (${a.arrows[0].x.toFixed(0)} → ${b.arrows[0].x.toFixed(0)})`);
}
{
  const st = ALL_STAGES.find((s) => s.id === "vale-1")!;
  const e = makeEngine(st, 3);
  const grunt = e.fighters.find((f) => f.team === 1)!;
  e.damageFighter(grunt, 9999, { knock: 300 });
  assert(e.ragdolls.length === 1 && !grunt.alive && e.kills === 1, "kill spawns a ragdoll and counts");
  for (let i = 0; i < 90; i++) e.update(1 / 60);
  assert(e.ragdolls[0].nodes.every((n) => n.y <= GROUND_Y + 0.01), "ragdoll rests on the ground");
  const barrel = e.props.find((p) => p.kind === "barrel")!;
  const near = e.spawnEnemy("grunt", barrel.x + 40, true);
  e.explode(barrel.x, barrel.y - 30, 170, 500, true);
  assert(!near.alive, "barrel explosion kills nearby foe");
}
{
  const st = ALL_STAGES.find((s) => s.id === "vale-2")!;
  const e = makeEngine(st, 4);
  const cage = e.props.find((p) => p.kind === "cage")!;
  (e as unknown as { damageProp: (p: unknown, n: number, b: boolean) => void }).damageProp(cage, 999, true);
  assert(e.hostages[0].freed && e.hostagesFreed === 1, "breaking a cage frees its hostage");
}
{
  // trajectory preview length by difficulty is UI-driven; ensure preview responds to wind
  const st = ALL_STAGES.find((s) => s.id === "training_range")!;
  const e = makeEngine({ ...st, windBase: -120, windVar: 0 }, 3);
  e.beginDraw(); e.player.draw = 1; e.aim = 0.5;
  const pts = e.previewTrajectory(26);
  const e2 = makeEngine({ ...st, windBase: 0, windVar: 0 }, 3);
  e2.beginDraw(); e2.player.draw = 1; e2.aim = 0.5;
  const pts2 = e2.previewTrajectory(26);
  assert(pts.length > 5 && pts[pts.length - 1].x < pts2[pts2.length - 1].x, "headwind shortens the preview arc");
}
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
