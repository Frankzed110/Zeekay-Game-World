/**
 * Browser smoke test for the web build (Playwright + Chromium).
 *   1. cd frontend && EXPO_PUBLIC_BACKEND_URL=http://localhost:8001 npx expo export -p web
 *   2. serve dist/ as an SPA (any static server with index.html fallback) and run the backend
 *   3. BASE_URL=http://127.0.0.1:3000 node tests/e2e/smoke.js
 * Checks: title → briefing → combat (tutorial, keyboard + mouse fire, HUD), armory buy/craft,
 * phone-portrait screens without horizontal overflow, and no console/page errors.
 */
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const SEED = {
  profile: { name: "Smoke", level: 10, xp: 0, gold: 8000, klass: "ranger", attrPoints: 9, attrs: { power: 0, precision: 0, agility: 0, vitality: 0 } },
  inventory: { bows: ["hunter_shortbow"], armors: ["travelers_garb"], crafted: [], materials: { oakwood: 10, emberstone: 10, frostiron: 10, tidepearl: 10 } },
  progress: { tutorialDone: false },
  updated_at: "2030-01-01T00:00:00Z",
};

let failures = 0;
const check = (cond, msg) => {
  console.log(cond ? "ok  " : "FAIL", msg);
  if (!cond) failures++;
};

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const watch = (p) => {
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  };

  // Fresh journey → combat
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  watch(p);
  await p.goto(BASE, { waitUntil: "networkidle" });
  check(await p.getByTestId("title-continue-button").isVisible(), "title renders");
  await p.getByTestId("title-continue-button").click();
  await p.getByTestId("mission-deploy-button").click();
  for (let i = 0; i < 3; i++) await p.getByTestId("combat-tutorial-next").click();
  check(await p.getByTestId("combat-wind-indicator").isVisible(), "combat HUD visible");
  await p.keyboard.down("d");
  await p.waitForTimeout(1500);
  await p.keyboard.up("d");
  for (let i = 0; i < 4; i++) {
    await p.keyboard.down(" ");
    await p.waitForTimeout(900);
    await p.keyboard.up(" ");
    await p.waitForTimeout(300);
  }
  await p.mouse.move(700, 380);
  await p.mouse.down();
  await p.mouse.move(560, 500, { steps: 6 });
  await p.waitForTimeout(800);
  await p.mouse.up();
  await p.waitForTimeout(600);
  const score = Number((await p.getByTestId("combat-score").innerText()).split("\n")[0].replace(/,/g, ""));
  check(Number.isFinite(score), `score readable (${score})`);
  await p.keyboard.press("Escape");
  check(await p.getByTestId("pause-modal").isVisible(), "Esc opens pause");
  await p.getByTestId("pause-resume-button").click();

  // Armory with a seeded save
  await p.evaluate((s) => localStorage.setItem("zgw_save_v1", JSON.stringify(s)), SEED);
  await p.goto(`${BASE}/armory`, { waitUntil: "networkidle" });
  await p.getByTestId("armory-tabs-bows").click();
  await p.getByTestId("armory-bow-yew_warbow-buy").dblclick();
  await p.waitForTimeout(300);
  check((await p.getByTestId("armory-gold").innerText()).startsWith("7750"), "double-tap buy charges once");
  await p.getByTestId("armory-tabs-craft").click();
  await p.getByTestId("armory-recipe-emberlash-craft").click();
  check((await p.getByTestId("armory-recipe-emberlash-owned").count()) === 1, "crafting forges a bow");

  // Phone portrait screens
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  watch(m);
  await m.goto(BASE, { waitUntil: "networkidle" });
  await m.evaluate((s) => localStorage.setItem("zgw_save_v1", JSON.stringify({ ...s, progress: { tutorialDone: true } })), SEED);
  for (const r of ["", "story", "arena", "armory", "champions", "mission/vale-1", "settings", "combat/vale-1"]) {
    await m.goto(`${BASE}/${r}`, { waitUntil: "networkidle" });
    await m.waitForTimeout(600);
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(!overflow, `portrait /${r} has no horizontal overflow`);
  }

  check(errors.length === 0, `no console/page errors${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
  await browser.close();
  console.log(failures ? `${failures} FAILURE(S)` : "ALL PASS");
  process.exit(failures ? 1 : 0);
})();
