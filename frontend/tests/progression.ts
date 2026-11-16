/** Progression rules: rewards, unlocks, tournament flow, cloud merge. Run: yarn test:progression */
import { getMission } from "../src/game/missions";
import { xpForLevel } from "../src/game/rpg";
import type { EngineResult } from "../src/game/types";
import { applyMissionResult, defaultSave, normalizeSave, pickNewer, stageUnlocked, nextStoryStage } from "../src/state/progression";

declare const process: { exit(code: number): never };

let fails = 0;
const ok = (c: unknown, m: string) => { console.log(c ? "ok  " : "FAIL", m); if (!c) fails++; };
const res = (o: Partial<EngineResult>): EngineResult => ({ victory: true, score: 1000, breakdown: [], kills: 5, headshots: 1, shots: 8, hits: 6, hostagesSaved: 0, hostagesLost: 0, gatePct: 100, time: 60, stars: [true, true, false], secretDone: false, wave: 0, damageTaken: 0, hpPct: 100, ...o });
const rnd = () => 0.5;

let s = defaultSave("Tester");
ok(stageUnlocked(s, "vale-1") && !stageUnlocked(s, "vale-2") && !stageUnlocked(s, "ember-1"), "only first stage unlocked at start");
let out = applyMissionResult(s, getMission("vale-1")!, res({}), "normal", 25, rnd);
s = out.save;
ok(s.progress.stages["vale-1"].stars === 2 && out.rewards.unlockedStage === "vale-2", "victory records stars and unlocks next stage");
ok(out.rewards.xp === 40 + 5 * 8 && out.rewards.gold === 30 + 100 + 25, "xp/gold formula (tier 1, 5 kills, +found gold)");
ok(s.inventory.materials.oakwood === 2, "kingdom material drop");
ok(nextStoryStage(s) === "vale-2", "next story stage advances");
// Boss → next kingdom
s = applyMissionResult(s, getMission("vale-2")!, res({}), "normal", 0, rnd).save;
out = applyMissionResult(s, getMission("vale-3")!, res({}), "normal", 0, rnd);
s = out.save;
ok(s.progress.kingdomsUnlocked === 2 && out.rewards.unlockedKingdom === "Emberpeak" && stageUnlocked(s, "ember-1"), "boss victory unlocks next kingdom");
// Level ups grant 3 attr points each
const lvl = s.profile.level;
ok(lvl >= 2 && s.profile.attrPoints === (lvl - 1) * 3, `levels grant +3 attribute points (lv ${lvl}, pts ${s.profile.attrPoints})`);
ok(xpForLevel(4) === 800, "xpForLevel(n) = 100·n^1.5");
// Defeat keeps stars, no unlock
const d = applyMissionResult(s, getMission("ember-1")!, res({ victory: false, stars: [false, false, false] }), "normal", 0, rnd);
ok(!d.save.progress.stages["ember-1"]?.stars && !d.rewards.unlockedStage && d.rewards.xp === 5 * 4, "defeat gives partial xp and no unlock");
// Tournament
let t = defaultSave();
let o = applyMissionResult(t, getMission("arena_tournament-1")!, res({ score: 900 }), "normal", 0, rnd);
ok(o.save.progress.tournament.round === 1 && o.submit === null, "tournament advances to semifinal without submitting");
o = applyMissionResult(o.save, getMission("arena_tournament-2")!, res({ score: 800 }), "normal", 0, rnd);
o = applyMissionResult(o.save, getMission("arena_tournament-3")!, res({ score: 700 }), "normal", 0, rnd);
ok(o.submit?.score === 2400 && o.save.progress.tournament.round === 0 && o.save.stats.arenasWon === 1, "tournament final submits cumulative score and resets");
o = applyMissionResult(t, getMission("arena_survival")!, res({ victory: false, wave: 6, score: 300 }), "normal", 0, rnd);
ok(o.submit?.mode === "arena_survival" && o.save.stats.bestSurvivalWave === 6, "survival submits and tracks best wave");
// Training mastery
o = applyMissionResult(t, getMission("training_range")!, res({ stars: [true, true, true], score: 900 }), "normal", 0, rnd);
ok(o.save.mastery.challenges.range?.stars === 3, "training drills record mastery stars");
// Merge
const a = { ...defaultSave(), updated_at: "2026-01-01T00:00:00Z" };
const b = { ...defaultSave("Cloud"), updated_at: "2026-02-01T00:00:00Z" };
ok(pickNewer(a, b).profile.name === "Cloud" && pickNewer(b, a).profile.name === "Cloud", "cloud merge: newer wins");
ok(normalizeSave({ profile: { level: 5 } }).inventory.bows.includes("hunter_shortbow"), "partial saves normalize safely");
// Regression: replaying a won round is practice — bracket and total unchanged, no submit
t = defaultSave();
let q = applyMissionResult(t, getMission("arena_tournament-1")!, res({ score: 900 }), "normal", 0, rnd);
q = applyMissionResult(q.save, getMission("arena_tournament-1")!, res({ score: 900 }), "normal", 0, rnd);
ok(q.save.progress.tournament.round === 1 && q.save.progress.tournament.score === 900 && q.rewards.tournament?.practice && q.submit === null, "replaying a won tournament round is practice only");
ok(!stageUnlocked(q.save, "arena_tournament-3") && stageUnlocked(q.save, "arena_tournament-2"), "only the current tournament round is unlocked");
// Regression: a defeat never sets a stage best / NEW BEST
const lost = applyMissionResult(defaultSave(), getMission("vale-1")!, res({ victory: false, score: 400, stars: [false, false, false] }), "normal", 0, rnd);
ok(!lost.rewards.newBest && (lost.save.progress.stages["vale-1"]?.best ?? 0) === 0, "defeat does not record a stage best");
console.log(fails ? `${fails} FAILURE(S)` : "ALL PASS");
process.exit(fails ? 1 : 0);
