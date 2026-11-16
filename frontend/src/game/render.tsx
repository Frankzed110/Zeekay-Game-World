"use no memo";
// Skia renderer for Zeekay Game World.
//
// Each frame is recorded into ONE SkPicture (createPicture) and shown through a single
// <Picture/> node. This keeps React reconciliation to one element per frame while still
// rendering through Skia on iOS, Android and web (CanvasKit). Layer order follows §12.

import { Canvas, Picture, Skia, createPicture, BlurStyle, PaintStyle, StrokeCap, TileMode } from "@shopify/react-native-skia";
import type { SkCanvas, SkColor, SkFont, SkPaint, SkPath, SkPicture } from "@shopify/react-native-skia";
import React from "react";
import type { StyleProp, ViewStyle } from "react-native";

import { ELEMENT_COLORS, ELEMENT_GLOW, FX, TEAM_COLORS, BIOMES, type BiomePalette } from "./palette";
import { Engine, GROUND_Y, WORLD_H } from "./engine";
import type { BiomeId, Fighter, Hostage, Prop, Ragdoll, Telegraph } from "./types";

// ---------------------------------------------------------------------------
// View math

export interface View {
  scale: number;
  visibleW: number;
  visibleH: number;
  offsetY: number; // world → canvas y offset (anchors the ground near the bottom)
  W: number;
  H: number;
}

export function computeView(W: number, H: number): View {
  // Portrait phones get a closer camera (900 world units wide) so fighters stay readable.
  const scale = Math.max(0.1, Math.min(W / (H > W ? 900 : 1100), H / 1000));
  const visibleW = W / scale;
  const visibleH = H / scale;
  // Keep a band below the ground for on-screen controls (pads / ability buttons) so they
  // never cover fighters' feet: the ground line sits ~14% (min 84px) above the bottom edge.
  const groundPx = Math.max(84, Math.min(130, H * 0.14));
  const offsetY = (H - groundPx) / scale - GROUND_Y;
  return { scale, visibleW, visibleH, offsetY, W, H };
}

export function screenToWorld(view: View, camX: number, sx: number, sy: number) {
  return { x: sx / view.scale + camX, y: sy / view.scale - view.offsetY };
}

// ---------------------------------------------------------------------------
// Paint + color caches (recording copies paint state, so shared paints are safe)

const colorCache = new Map<string, SkColor>();
function col(c: string): SkColor {
  let v = colorCache.get(c);
  if (!v) {
    v = Skia.Color(c);
    colorCache.set(c, v);
  }
  return v;
}

let _fill: SkPaint | null = null;
let _stroke: SkPaint | null = null;
function fill(c: string, alpha = 1): SkPaint {
  if (!_fill) {
    _fill = Skia.Paint();
    _fill.setAntiAlias(true);
  }
  _fill.setShader(null);
  _fill.setMaskFilter(null);
  _fill.setColor(col(c));
  _fill.setAlphaf(Math.max(0, Math.min(1, alpha)) * colorAlpha(c));
  return _fill;
}
function stroke(c: string, width: number, alpha = 1, round = true): SkPaint {
  if (!_stroke) {
    _stroke = Skia.Paint();
    _stroke.setAntiAlias(true);
    _stroke.setStyle(PaintStyle.Stroke);
  }
  _stroke.setMaskFilter(null);
  _stroke.setColor(col(c));
  _stroke.setAlphaf(Math.max(0, Math.min(1, alpha)) * colorAlpha(c));
  _stroke.setStrokeWidth(width);
  _stroke.setStrokeCap(round ? StrokeCap.Round : StrokeCap.Butt);
  return _stroke;
}
const alphaCache = new Map<string, number>();
function colorAlpha(c: string): number {
  if (!c.startsWith("rgba")) return 1;
  let a = alphaCache.get(c);
  if (a === undefined) {
    const m = c.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);
    a = m ? parseFloat(m[1]) : 1;
    alphaCache.set(c, a);
  }
  return a;
}
function glow(c: string, sigma: number, alpha = 1): SkPaint {
  const p = fill(c, alpha);
  p.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, sigma, true));
  return p;
}
const rect = (x: number, y: number, w: number, h: number) => Skia.XYWHRect(x, y, w, h);
const rrect = (x: number, y: number, w: number, h: number, r: number) => Skia.RRectXY(Skia.XYWHRect(x, y, w, h), r, r);

function poly(points: number[]): SkPath {
  const b = Skia.PathBuilder.Make();
  b.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) b.lineTo(points[i], points[i + 1]);
  b.close();
  return b.build();
}

// Deterministic hash noise
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---------------------------------------------------------------------------
// Backdrop (also used by the title screen)

const mountainCache = new Map<string, SkPath>();
function mountainPath(biome: BiomeId, layer: number, width: number): SkPath {
  const key = `${biome}:${layer}:${Math.round(width / 500)}`;
  const hit = mountainCache.get(key);
  if (hit) return hit;
  const pts: number[] = [];
  const base = GROUND_Y - 40 + layer * 30;
  const amp = [330, 240, 150][layer];
  const step = [220, 160, 110][layer];
  const jag = biome === "ember" || biome === "frost" ? 1 : 0.6;
  pts.push(-200, WORLD_H + 200);
  for (let x = -200, i = 0; x <= width + 400; x += step, i++) {
    const n = hash(i * (layer + 3) + layer * 17 + biome.length * 13);
    const n2 = hash(i * 7.3 + layer * 3.1);
    const peak = base - amp * (0.35 + 0.65 * n) * (0.8 + 0.2 * Math.sin(i * 0.7 + layer));
    pts.push(x, peak);
    pts.push(x + step * 0.5, peak + amp * 0.25 * jag * n2 + 20);
  }
  pts.push(width + 400, WORLD_H + 200);
  const p = poly(pts);
  mountainCache.set(key, p);
  return p;
}

export function drawSky(canvas: SkCanvas, pal: BiomePalette, W: number, H: number, t: number) {
  const p = fill(pal.skyTop);
  p.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: 0 }, { x: 0, y: H }, [col(pal.skyTop), col(pal.skyMid), col(pal.skyBottom)], [0, 0.55, 1], TileMode.Clamp));
  canvas.drawRect(rect(0, 0, W, H), p);
  // sun / moon with glow
  const sx = W * 0.72 + Math.sin(t * 0.03) * 10;
  const sy = H * pal.sunY;
  const r = Math.min(W, H) * 0.07;
  const g = fill(pal.sun);
  g.setShader(Skia.Shader.MakeRadialGradient({ x: sx, y: sy }, r * 4, [col(pal.sunGlow), col("rgba(0,0,0,0)")], null, TileMode.Clamp));
  canvas.drawCircle(sx, sy, r * 4, g);
  canvas.drawCircle(sx, sy, r, fill(pal.sun));
}

/** Parallax silhouettes in world units (canvas already scaled + offset). */
export function drawParallax(canvas: SkCanvas, biome: BiomeId, camX: number, visibleW: number, worldW: number) {
  const pal = BIOMES[biome];
  const layers: [string, number][] = [
    [pal.far, 0.2],
    [pal.mid, 0.45],
    [pal.near, 0.7],
  ];
  layers.forEach(([c, f], i) => {
    canvas.save();
    canvas.translate(camX * (1 - f), 0);
    canvas.drawPath(mountainPath(biome, i, worldW * f + visibleW + 400), fill(c));
    if (biome === "frost" || (biome === "ember" && i === 0)) {
      // snowcaps / ash caps
      canvas.drawPath(mountainPath(biome, i, worldW * f + visibleW + 400), stroke(biome === "frost" ? "#F4FBFF" : "#5A2A22", 3, 0.5));
    }
    canvas.restore();
  });
  // fog band
  canvas.drawRect(rect(camX - 100, GROUND_Y - 220, visibleW + 200, 220), fill(pal.fog));
}

function drawMidProps(canvas: SkCanvas, biome: BiomeId, camX: number, visibleW: number) {
  const pal = BIOMES[biome];
  const f = 0.85;
  canvas.save();
  canvas.translate(camX * (1 - f), 0);
  const left = camX * f - 300;
  const right = camX * f + visibleW + 300;
  const spacing = 230;
  for (let i = Math.floor(left / spacing); i <= Math.ceil(right / spacing); i++) {
    const n = hash(i * 3.7 + biome.length);
    if (n < 0.35) continue;
    const x = i * spacing + n * 90;
    const y = GROUND_Y + 6;
    const s = 0.7 + n * 0.6;
    if (biome === "vale" || biome === "yard") {
      canvas.drawRect(rect(x - 7 * s, y - 70 * s, 14 * s, 70 * s), fill(pal.prop));
      canvas.drawPath(poly([x - 60 * s, y - 60 * s, x, y - 230 * s, x + 60 * s, y - 60 * s]), fill(pal.prop));
      canvas.drawPath(poly([x - 46 * s, y - 120 * s, x, y - 250 * s, x + 46 * s, y - 120 * s]), fill(pal.propAccent, 0.55));
    } else if (biome === "ember") {
      canvas.drawPath(poly([x - 40 * s, y, x - 18 * s, y - 180 * s, x + 6 * s, y - 210 * s, x + 34 * s, y]), fill(pal.prop));
      canvas.drawLine(x - 8 * s, y - 20 * s, x + 2 * s, y - 150 * s, stroke(pal.propAccent, 3, 0.7));
    } else if (biome === "frost") {
      canvas.drawRect(rect(x - 6 * s, y - 60 * s, 12 * s, 60 * s), fill(pal.prop));
      canvas.drawPath(poly([x - 55 * s, y - 50 * s, x, y - 210 * s, x + 55 * s, y - 50 * s]), fill(pal.prop));
      canvas.drawPath(poly([x - 30 * s, y - 130 * s, x, y - 210 * s, x + 30 * s, y - 130 * s]), fill("#F4FBFF", 0.85));
    } else if (biome === "isles") {
      if (n > 0.7) {
        canvas.drawRect(rect(x - 18 * s, y - 170 * s, 36 * s, 170 * s), fill(pal.prop));
        canvas.drawRect(rect(x - 26 * s, y - 182 * s, 52 * s, 14 * s), fill(pal.propAccent, 0.6));
      } else {
        canvas.drawLine(x, y, x + 24 * s, y - 180 * s, stroke(pal.prop, 9 * s));
        for (let k = 0; k < 5; k++) {
          const a = -Math.PI / 2 + (k - 2) * 0.6;
          canvas.drawLine(x + 24 * s, y - 180 * s, x + 24 * s + Math.cos(a) * 70 * s, y - 180 * s + Math.sin(a) * 40 * s + 30 * s, stroke(pal.propAccent, 6 * s, 0.7));
        }
      }
    } else if (biome === "arena") {
      canvas.drawRect(rect(x - 80, y - 240, 160, 240), fill(pal.prop));
      canvas.drawRRect(rrect(x - 50, y - 190, 100, 190, 50), fill(pal.near));
      canvas.drawRect(rect(x - 86, y - 250, 172, 14), fill(pal.propAccent, 0.45));
    }
  }
  canvas.restore();
}

function drawGround(canvas: SkCanvas, pal: BiomePalette, camX: number, visibleW: number, biome: BiomeId) {
  const p = fill(pal.ground);
  p.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: GROUND_Y }, { x: 0, y: WORLD_H + 120 }, [col(pal.groundTop), col(pal.ground)], [0, 0.35], TileMode.Clamp));
  canvas.drawRect(rect(camX - 100, GROUND_Y, visibleW + 200, 2000), p);
  canvas.drawRect(rect(camX - 100, GROUND_Y - 3, visibleW + 200, 7), fill(pal.crust));
  // tufts / rocks
  const step = 46;
  for (let i = Math.floor(camX / step) - 1; i < (camX + visibleW) / step + 1; i++) {
    const n = hash(i * 1.37);
    const x = i * step + n * 20;
    if (biome === "frost") canvas.drawCircle(x, GROUND_Y + 2, 6 + n * 8, fill("#F4FBFF", 0.8));
    else if (biome === "ember") {
      if (n > 0.7) canvas.drawCircle(x, GROUND_Y + 14, 3, glow("#FF6A2B", 3, 0.8));
    } else if (biome === "isles" || biome === "arena") {
      if (n > 0.5) canvas.drawCircle(x, GROUND_Y + 10 + n * 20, 2.5, fill(pal.crust, 0.6));
    } else {
      canvas.drawPath(poly([x - 6, GROUND_Y + 2, x - 2, GROUND_Y - 10 - n * 8, x + 1, GROUND_Y + 2]), fill(pal.crust));
      canvas.drawPath(poly([x, GROUND_Y + 2, x + 5, GROUND_Y - 7 - n * 6, x + 7, GROUND_Y + 2]), fill(pal.crust, 0.8));
    }
  }
}

function drawAmbient(canvas: SkCanvas, pal: BiomePalette, W: number, H: number, t: number, heavy: boolean) {
  const n = heavy ? 90 : 34;
  for (let i = 0; i < n; i++) {
    const h1 = hash(i * 9.1);
    const h2 = hash(i * 3.3 + 1);
    let x: number;
    let y: number;
    switch (pal.ambient) {
      case "snow":
        x = ((h1 * W + t * (heavy ? 160 : 40) * (0.5 + h2)) % (W + 40)) - 20;
        y = (h2 * H + t * (60 + h1 * 60)) % H;
        canvas.drawCircle(x, y, 1.5 + h2 * 2.5, fill("#FFFFFF", 0.75));
        break;
      case "ember":
        x = (h1 * W + Math.sin(t + i) * 20) % W;
        y = H - ((h2 * H + t * (30 + h1 * 40)) % H);
        canvas.drawCircle(x, y, 1.5 + h2 * 2, glow("#FF8A3D", 2, 0.8));
        break;
      case "drop":
        x = (h1 * W + t * 30) % W;
        y = (h2 * H + t * (500 + h1 * 300)) % H;
        canvas.drawLine(x, y, x - 3, y + 12, stroke("#BFEFF5", 1.5, 0.4));
        break;
      case "leaf":
        x = (h1 * W + t * (20 + h2 * 30)) % W;
        y = (h2 * H * 0.8 + t * 25 + Math.sin(t * 2 + i) * 14) % H;
        canvas.drawOval(rect(x, y, 6, 3), fill(i % 2 ? "#E3B341" : "#7CC653", 0.7));
        break;
      default:
        x = (h1 * W + t * 15) % W;
        y = (h2 * H + Math.sin(t + i) * 10) % H;
        canvas.drawCircle(x, y, 1.2, fill("#F2D2A0", 0.35));
    }
  }
}

export function drawVignette(canvas: SkCanvas, W: number, H: number, strength = 1) {
  const p = fill("#000000");
  p.setShader(Skia.Shader.MakeRadialGradient({ x: W / 2, y: H / 2 }, Math.max(W, H) * 0.75, [col("rgba(0,0,0,0)"), col(`rgba(0,0,0,${0.55 * strength})`)], [0.55, 1], TileMode.Clamp));
  canvas.drawRect(rect(0, 0, W, H), p);
}

/** Title-screen vista: sky + parallax + mid props + ground, slowly panning. */
export function renderVista(biome: BiomeId, W: number, H: number, t: number): SkPicture {
  return createPicture((canvas) => {
    const view = computeView(W, H);
    const pal = BIOMES[biome];
    drawSky(canvas, pal, W, H, t);
    const camX = (t * 25) % 2000;
    canvas.save();
    canvas.scale(view.scale, view.scale);
    canvas.translate(-camX, view.offsetY);
    drawParallax(canvas, biome, camX, view.visibleW, 4000);
    drawMidProps(canvas, biome, camX, view.visibleW);
    drawGround(canvas, pal, camX, view.visibleW, biome);
    canvas.restore();
    drawAmbient(canvas, pal, W, H, t, false);
    drawVignette(canvas, W, H, 1.2);
  }, { width: W, height: H });
}

// ---------------------------------------------------------------------------
// Characters (low-poly rigs)

function drawBow(canvas: SkCanvas, draw: number, angle: number, sx: number, sy: number, nocked: boolean, element: string, trim: string) {
  canvas.save();
  canvas.translate(sx, sy);
  canvas.rotate((-angle * 180) / Math.PI, 0, 0);
  const pull = 4 + draw * 20;
  const b = Skia.PathBuilder.Make();
  b.moveTo(0, -28);
  b.quadTo(16, 0, 0, 28);
  canvas.drawPath(b.build(), stroke(FX.wood, 5));
  canvas.drawPath(b.build(), stroke(trim, 1.5, 0.8));
  canvas.drawLine(0, -28, -pull, 0, stroke(FX.bowString, 1.2));
  canvas.drawLine(-pull, 0, 0, 28, stroke(FX.bowString, 1.2));
  if (nocked) {
    canvas.drawLine(-pull, 0, 34 - pull * 0.2, 0, stroke(FX.arrowShaft, 2.5));
    canvas.drawPath(poly([34 - pull * 0.2, -4, 42 - pull * 0.2, 0, 34 - pull * 0.2, 4]), fill(element));
  }
  // drawing arm
  canvas.drawLine(-14, 4, -pull, 0, stroke("#00000000", 0));
  canvas.restore();
}

function drawFighter(canvas: SkCanvas, f: Fighter, e: Engine) {
  const s = f.h / 110;
  const flash = f.hitFlash > 0;
  const body = flash ? "#FFFFFF" : f.body;
  const trim = flash ? "#FFFFFF" : f.trim;
  const isPlayerSide = f.team === 0;
  const moving = f.state === "move" || f.state === "charge" || (f.kind === "player" && e.moveDir !== 0);
  const swing = moving ? Math.sin(f.anim) * 12 : 0;

  // shadow
  canvas.drawOval(rect(f.x - f.w * 0.6, GROUND_Y - 6, f.w * 1.2, 12), fill(FX.shadow));

  canvas.save();
  canvas.translate(f.x, f.y);
  canvas.scale(f.facing * s, s);

  // status aura
  const st = f.statuses;
  if (st.burn > 0) canvas.drawCircle(0, -55, 46, glow("#FF6A2B", 14, 0.35));
  if (st.slow > 0) canvas.drawCircle(0, -55, 46, glow("#8FD3FF", 14, 0.35));
  if (st.poison > 0) canvas.drawCircle(0, -55, 46, glow("#7EE05A", 14, 0.3));
  if (st.shock > 0) canvas.drawCircle(0, -55, 50, glow("#C8A8FF", 10, 0.6));
  if (f.buffT > 0) canvas.drawCircle(0, -55, 50, glow("#6EE7A0", 12, 0.25));
  if (f.kind === "boss" && f.enraged) canvas.drawCircle(0, -60, 64, glow("#FF3B2F", 18, 0.35));

  const skin = f.kind === "player" ? TEAM_COLORS.player.skin : isPlayerSide ? "#D9A27A" : "#2A2230";
  const legC = flash ? "#FFFFFF" : isPlayerSide ? "#3B2E26" : "#1E1824";

  // legs (low-poly)
  canvas.drawLine(-5, -46, -6 + swing * 0.8, 0, stroke(legC, 9));
  canvas.drawLine(5, -46, 6 - swing * 0.8, 0, stroke(legC, 9));
  canvas.drawRect(rect(-11 + swing * 0.8, -4, 12, 5), fill(legC));
  canvas.drawRect(rect(0 - swing * 0.8, -4, 12, 5), fill(legC));

  // torso
  if (f.kind === "escort") {
    canvas.drawPath(poly([-20, -2, -14, -78, 14, -78, 22, -2]), fill(body)); // robe
    canvas.drawLine(-18, -40, 20, -40, stroke(trim, 3));
    canvas.drawLine(24, -96, 30, 0, stroke(FX.wood, 4)); // staff
  } else if (f.kind === "shaman") {
    canvas.drawPath(poly([-18, -4, -14, -80, 14, -80, 18, -4]), fill(body));
    canvas.drawLine(22, -110, 22, 0, stroke(FX.woodDark, 4));
    canvas.drawCircle(22, -112, 8, glow(trim, 6, 0.9));
  } else {
    canvas.drawPath(poly([-15, -46, -13, -82, 13, -82, 15, -46]), fill(body));
    canvas.drawRect(rect(-15, -52, 30, 5), fill(trim));
    canvas.drawPath(poly([-13, -82, 0, -70, 13, -82]), fill(trim, 0.85));
  }

  // head
  canvas.drawCircle(0, -93, 11, fill(skin));
  if (f.kind === "player") {
    canvas.drawPath(poly([-12, -92, -10, -106, 6, -108, 13, -98, 4, -100, -6, -96]), fill(TEAM_COLORS.player.hair));
    canvas.drawPath(poly([-10, -98, -24, -84, -12, -90]), fill(TEAM_COLORS.player.hair)); // ponytail
    canvas.drawLine(-12, -100, 10, -104, stroke(trim, 2.5));
  } else if (isPlayerSide) {
    canvas.drawPath(poly([-12, -94, 0, -110, 12, -94]), fill(f.trim, flash ? 1 : 0.9));
  } else {
    // Hollow hood + glowing eyes
    canvas.drawPath(poly([-14, -86, -12, -102, 0, -112, 12, -102, 14, -86, 8, -96, -8, -96]), fill(body));
    canvas.drawCircle(4, -94, 2.2, glow(f.kind === "boss" ? "#FF3B2F" : trim, 2, 1));
    canvas.drawCircle(9, -94, 2.2, glow(f.kind === "boss" ? "#FF3B2F" : trim, 2, 1));
  }
  if (f.kind === "boss") {
    // crown / horns
    canvas.drawPath(poly([-14, -104, -20, -128, -6, -110, 0, -132, 6, -110, 20, -128, 14, -104]), fill(trim));
    canvas.drawPath(poly([-16, -82, -32, -70, -16, -60]), fill(trim, 0.8)); // pauldron
    canvas.drawPath(poly([16, -82, 32, -70, 16, -60]), fill(trim, 0.8));
  }

  // weapons / gear
  const shoulderY = -72;
  if (f.kind === "player" || f.kind === "archer" || f.kind === "scout" || f.kind === "marksman" || f.kind === "champion" || f.kind === "boss") {
    const draw = f.kind === "player" ? f.draw : f.draw;
    const ang = f.kind === "player" ? f.angle : f.state === "draw" ? 0.45 : 0.1;
    const nocked = f.kind === "player" ? e.drawing : f.state === "draw";
    const el = f.kind === "player" ? ELEMENT_COLORS[e.element] : FX.arrowShaft;
    canvas.drawLine(0, shoulderY + 2, 12, shoulderY, stroke(skin, 6));
    drawBow(canvas, draw, ang, 16, shoulderY, nocked, el, trim);
  } else if (f.kind === "grunt" || f.kind === "tank") {
    const raise = f.state === "windup" ? -1 : f.state === "strike" ? 1 : 0;
    const a = raise === -1 ? -2.2 : raise === 1 ? 0.3 : -0.6;
    const hx = 14 + Math.cos(a) * 26;
    const hy = shoulderY + Math.sin(a) * 26;
    canvas.drawLine(6, shoulderY, hx, hy, stroke(skin, 6));
    canvas.drawLine(hx, hy, hx + Math.cos(a) * 34, hy + Math.sin(a) * 34, stroke(FX.woodDark, 6));
    canvas.drawCircle(hx + Math.cos(a) * 36, hy + Math.sin(a) * 36, 7, fill(f.kind === "tank" ? FX.metal : trim));
  }
  if (f.shield || f.kind === "tank") {
    canvas.drawRRect(rrect(14, -86, 14, 62, 5), fill(flash ? "#FFFFFF" : FX.metal));
    canvas.drawRRect(rrect(14, -86, 14, 62, 5), stroke(trim, 2));
  }
  canvas.restore();

  // HP bars (enemies/allies when damaged, not boss — boss has a HUD bar)
  if (f.kind !== "player" && f.kind !== "boss" && f.hp < f.maxHp) {
    const w = 44;
    const y = f.y - f.h - 22;
    canvas.drawRRect(rrect(f.x - w / 2, y, w, 5, 2), fill("#000000", 0.55));
    canvas.drawRRect(rrect(f.x - w / 2, y, w * Math.max(0, f.hp / f.maxHp), 5, 2), fill(f.team === 0 ? "#36A369" : "#D94E4E"));
  }
}

function drawRagdoll(canvas: SkCanvas, r: Ragdoll) {
  const a = Math.min(1, r.life / 0.8);
  const n = r.nodes;
  const w = 9 * r.scale;
  canvas.drawLine(n[1].x, n[1].y, n[2].x, n[2].y, stroke(r.body, w * 1.6, a));
  canvas.drawLine(n[1].x, n[1].y, n[3].x, n[3].y, stroke(r.body, w * 0.7, a));
  canvas.drawLine(n[2].x, n[2].y, n[4].x, n[4].y, stroke("#1E1824", w, a));
  canvas.drawLine(n[2].x, n[2].y, n[5].x, n[5].y, stroke("#1E1824", w, a));
  canvas.drawCircle(n[0].x, n[0].y, 11 * r.scale, fill(r.body, a));
  canvas.drawLine(n[1].x, n[1].y, n[2].x, n[2].y, stroke(r.trim, w * 0.4, a * 0.8));
}

function drawHostage(canvas: SkCanvas, h: Hostage) {
  if (!h.alive && !h.saved) return;
  const a = h.saved ? Math.max(0, 1 - h.t) : 1;
  if (a <= 0) return;
  const flash = h.hitFlash > 0;
  const c = TEAM_COLORS.hostage;
  const swing = h.freed ? Math.sin(h.anim) * 10 : 0;
  canvas.save();
  canvas.translate(h.x, h.y);
  canvas.scale(h.freed ? -1 : 1, 0.85);
  canvas.drawLine(-4, -44, -5 + swing, 0, stroke("#4A3A2A", 8, a));
  canvas.drawLine(4, -44, 5 - swing, 0, stroke("#4A3A2A", 8, a));
  canvas.drawPath(poly([-13, -44, -11, -78, 11, -78, 13, -44]), fill(flash ? "#FFFFFF" : c.body, a));
  canvas.drawCircle(0, -90, 10, fill(c.skin, a));
  canvas.drawPath(poly([-10, -92, 0, -104, 10, -92]), fill(c.hair, a));
  // arms up when caged, pumping when running
  const armY = h.freed ? -62 + swing : -104 + Math.sin(h.anim) * 4;
  canvas.drawLine(-8, -74, -16, armY, stroke(c.skin, 5, a));
  canvas.drawLine(8, -74, 16, armY, stroke(c.skin, 5, a));
  canvas.restore();
}

function drawProp(canvas: SkCanvas, p: Prop) {
  const flash = p.hitFlash > 0;
  const x = p.x - p.w / 2;
  const y = p.y - p.h;
  if (p.kind === "bell") {
    // post from ground to bell
    canvas.drawLine(p.x, GROUND_Y, p.x, p.y - p.h - 10, stroke(FX.woodDark, 8));
    canvas.drawLine(p.x - 30, p.y - p.h - 10, p.x + 30, p.y - p.h - 10, stroke(FX.woodDark, 6));
    const sw = Math.sin(p.swing * 18) * p.swing * 30;
    canvas.save();
    canvas.translate(p.x, p.y - p.h - 10);
    canvas.rotate(sw, 0, 0);
    canvas.drawLine(0, 0, 0, 8, stroke(FX.rope, 3));
    canvas.drawPath(poly([-14, 10, 14, 10, 22, 44, -22, 44]), fill(p.alive ? "#E3B341" : "#9A8A6A"));
    canvas.drawCircle(0, 46, 5, fill(p.alive ? "#B98A2A" : "#6A5A4A"));
    if (p.alive) canvas.drawCircle(0, 28, 26, glow("#FFD24A", 10, 0.35));
    canvas.restore();
    return;
  }
  if (!p.alive) {
    if (p.kind === "gate") canvas.drawRect(rect(x, p.y - 30, p.w, 30), fill(FX.woodDark, 0.8));
    if (p.kind === "cage") {
      canvas.drawRect(rect(x, p.y - 8, p.w, 8), fill(FX.metal, 0.7));
    }
    return;
  }
  switch (p.kind) {
    case "crate":
      canvas.drawRect(rect(x, y, p.w, p.h), fill(flash ? "#FFFFFF" : FX.wood));
      canvas.drawRect(rect(x, y, p.w, p.h), stroke(FX.woodDark, 4, 1, false));
      canvas.drawLine(x + 4, y + 4, x + p.w - 4, y + p.h - 4, stroke(FX.woodDark, 4));
      canvas.drawLine(x + p.w - 4, y + 4, x + 4, y + p.h - 4, stroke(FX.woodDark, 4));
      break;
    case "barrel":
      canvas.drawRRect(rrect(x, y, p.w, p.h, 12), fill(flash ? "#FFFFFF" : "#8E2B1F"));
      canvas.drawRect(rect(x, y + 12, p.w, 6), fill(FX.metal));
      canvas.drawRect(rect(x, y + p.h - 18, p.w, 6), fill(FX.metal));
      canvas.drawCircle(p.x, y + p.h * 0.5, 8, fill("#FFD24A"));
      canvas.drawPath(poly([p.x - 4, y + p.h * 0.5 + 4, p.x, y + p.h * 0.5 - 6, p.x + 4, y + p.h * 0.5 + 4]), fill("#8E2B1F"));
      break;
    case "cage": {
      canvas.drawRect(rect(x, y, p.w, 8), fill(FX.metal));
      canvas.drawRect(rect(x, p.y - 8, p.w, 8), fill(FX.metal));
      for (let i = 0; i <= 5; i++) {
        const bx = x + (p.w * i) / 5;
        canvas.drawLine(bx, y + 4, bx, p.y - 4, stroke(flash ? "#FFFFFF" : FX.metal, 4));
      }
      const hpw = p.w * (p.hp / p.maxHp);
      canvas.drawRRect(rrect(x, y - 14, p.w, 5, 2), fill("#000000", 0.5));
      canvas.drawRRect(rrect(x, y - 14, hpw, 5, 2), fill("#E3B341"));
      break;
    }
    case "gate": {
      const dmg = 1 - p.hp / p.maxHp;
      for (let i = 0; i < 3; i++) {
        const px = x + i * (p.w / 3);
        canvas.drawRect(rect(px, y + i * 6, p.w / 3 - 2, p.h - i * 6), fill(flash ? "#FFFFFF" : i % 2 ? FX.wood : "#8A5E36"));
        canvas.drawPath(poly([px, y + i * 6, px + p.w / 6, y + i * 6 - 16, px + p.w / 3 - 2, y + i * 6]), fill(FX.woodDark));
      }
      canvas.drawLine(x - 4, y + 50, x + p.w + 4, y + 50, stroke(FX.metal, 5));
      canvas.drawLine(x - 4, y + p.h - 50, x + p.w + 4, y + p.h - 50, stroke(FX.metal, 5));
      if (dmg > 0.3) canvas.drawLine(x + 6, y + 70, x + p.w - 10, y + 120, stroke("#1A120C", 3));
      if (dmg > 0.6) canvas.drawLine(x + p.w - 6, y + 130, x + 10, y + 180, stroke("#1A120C", 3));
      break;
    }
  }
}

function drawTelegraph(canvas: SkCanvas, tg: Telegraph, t: number) {
  const x = tg.x - tg.w / 2;
  if (!tg.fired) {
    const prog = 1 - tg.t / tg.total;
    const pulse = 0.5 + 0.5 * Math.sin(t * 20);
    canvas.drawRect(rect(x, GROUND_Y - 8, tg.w, 14), fill(FX.telegraph, 0.6 + 0.4 * pulse));
    canvas.drawRect(rect(x, GROUND_Y - 8, tg.w * prog, 14), fill(FX.telegraphEdge, 0.5));
    if (tg.kind === "lightning") canvas.drawRect(rect(x, 0, tg.w, GROUND_Y), fill("#C8A8FF", 0.08 + 0.1 * prog));
    if (tg.kind === "icicle") {
      const iy = -60 + prog * prog * (GROUND_Y - 20);
      if (prog > 0.6) canvas.drawPath(poly([tg.x - 10, iy - 50, tg.x + 10, iy - 50, tg.x, iy]), fill(FX.icicle));
    }
    if (tg.kind === "rain") canvas.drawRect(rect(x, 0, tg.w, GROUND_Y), fill("#FF4632", 0.05 + 0.08 * prog));
    if (tg.kind === "geyser") canvas.drawCircle(tg.x, GROUND_Y, 14 + 10 * pulse, glow(FX.geyser, 6, 0.6));
  } else if (tg.kind === "geyser") {
    const g = fill(FX.geyser);
    g.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: GROUND_Y }, { x: 0, y: GROUND_Y - 360 }, [col("#FFD24A"), col("rgba(255,106,43,0)")], null, TileMode.Clamp));
    canvas.drawRect(rect(x + 10, GROUND_Y - 360, tg.w - 20, 360), g);
  } else if (tg.kind === "slam") {
    // visual-only
  }
}

function drawBolt(canvas: SkCanvas, b: { x1: number; y1: number; x2: number; y2: number; life: number }, t: number) {
  const segs = 9;
  const pts: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const k = i / segs;
    const jitter = i === 0 || i === segs ? 0 : (hash(i + Math.floor(t * 30)) - 0.5) * 50;
    pts.push(b.x1 + (b.x2 - b.x1) * k + jitter, b.y1 + (b.y2 - b.y1) * k);
  }
  for (let i = 0; i < segs; i++) {
    canvas.drawLine(pts[i * 2], pts[i * 2 + 1], pts[i * 2 + 2], pts[i * 2 + 3], stroke(FX.lightning, 7, b.life * 1.5 * 0.35));
    canvas.drawLine(pts[i * 2], pts[i * 2 + 1], pts[i * 2 + 2], pts[i * 2 + 3], stroke("#FFFFFF", 2.5, Math.min(1, b.life * 4)));
  }
}

// ---------------------------------------------------------------------------
// Frame

export interface RenderOptions {
  trajectorySteps: number;
  fonts: { small: SkFont | null; big: SkFont | null };
}

export function renderFrame(e: Engine, view: View, opts: RenderOptions): SkPicture {
  const { W, H } = view;
  return createPicture((canvas) => {
    const biome = e.stage.biome;
    const pal = BIOMES[biome];
    e.updateCamera(view.visibleW);
    drawSky(canvas, pal, W, H, e.t);

    const shakeX = e.shake > 0 ? (hash(e.t * 60) - 0.5) * e.shake : 0;
    const shakeY = e.shake > 0 ? (hash(e.t * 60 + 9) - 0.5) * e.shake : 0;
    const camX = e.camX;
    canvas.save();
    canvas.scale(view.scale, view.scale);
    canvas.translate(-camX + shakeX, view.offsetY + shakeY);

    drawParallax(canvas, biome, camX, view.visibleW, e.worldW);
    drawMidProps(canvas, biome, camX, view.visibleW);
    drawGround(canvas, pal, camX, view.visibleW, biome);

    const left = camX - 200;
    const right = camX + view.visibleW + 200;
    const vis = (x: number) => x > left && x < right;

    // escort goal banner
    if (e.escort) {
      const gx = e.worldW - 220;
      canvas.drawLine(gx, GROUND_Y, gx, GROUND_Y - 160, stroke(FX.woodDark, 6));
      canvas.drawPath(poly([gx, GROUND_Y - 160, gx + 70, GROUND_Y - 140, gx, GROUND_Y - 118]), fill(pal.accent));
    }

    for (const tg of e.telegraphs) if (vis(tg.x)) drawTelegraph(canvas, tg, e.t);
    for (const p of e.props) if (vis(p.x)) drawProp(canvas, p);
    for (const h of e.hostages) if (vis(h.x)) drawHostage(canvas, h);
    // pickups
    for (const k of e.pickups) {
      if (!k.alive || !vis(k.x)) continue;
      if (k.kind === "gold") {
        canvas.drawCircle(k.x, k.y, 7, fill(FX.gold));
        canvas.drawCircle(k.x - 2, k.y - 2, 2.5, fill("#FFF6C8"));
      } else {
        canvas.drawCircle(k.x, k.y, 12, glow(FX.heal, 6, 0.6));
        canvas.drawRect(rect(k.x - 7, k.y - 2.5, 14, 5), fill("#FFFFFF"));
        canvas.drawRect(rect(k.x - 2.5, k.y - 7, 5, 14), fill("#FFFFFF"));
      }
    }
    for (const r of e.ragdolls) drawRagdoll(canvas, r);
    // fighters: enemies, allies, player last (on top)
    for (const f of e.fighters) if (f.alive && f.kind !== "player" && vis(f.x)) drawFighter(canvas, f, e);
    if (e.player.alive) drawFighter(canvas, e.player, e);

    // trajectory preview
    if (e.drawing && e.player.alive) {
      const pts = e.previewTrajectory(opts.trajectorySteps);
      const el = ELEMENT_COLORS[e.element];
      pts.forEach((p, i) => {
        if (i % 2) return;
        const a = 0.9 * (1 - i / Math.max(1, pts.length));
        canvas.drawCircle(p.x, p.y, 4, fill(i < 4 ? FX.trajectory : el, a));
      });
    }

    // arrows
    for (const a of e.arrows) {
      if (!a.alive || !vis(a.x)) continue;
      if (a.kind === "orb") {
        canvas.drawCircle(a.x, a.y, 14, glow("#7EE05A", 8, 0.6));
        canvas.drawCircle(a.x, a.y, 6, fill("#C9FFB0"));
        continue;
      }
      const sp = Math.hypot(a.vx, a.vy) || 1;
      const ux = a.vx / sp;
      const uy = a.vy / sp;
      const len = 36;
      const elc = ELEMENT_COLORS[a.element];
      if (a.stuck === 0) {
        for (let i = 1; i < a.trail.length; i++) {
          const p0 = a.trail[i - 1];
          const p1 = a.trail[i];
          canvas.drawLine(p0.x, p0.y, p1.x, p1.y, stroke(a.element !== "normal" ? elc : "#FFFFFF", 3, (i / a.trail.length) * (a.isPlayer ? 0.5 : 0.3)));
        }
        if (a.element !== "normal") canvas.drawCircle(a.x, a.y, 10, glow(ELEMENT_GLOW[a.element], 6, 1));
        if (a.power) canvas.drawCircle(a.x, a.y, 14, glow("#FF8A3D", 8, 0.6));
      }
      const shaft = a.team === 0 ? FX.arrowShaft : "#6E5A7A";
      const fade = a.stuck > 0 ? Math.min(1, a.stuck) : 1;
      canvas.drawLine(a.x - ux * len, a.y - uy * len, a.x, a.y, stroke(shaft, 3, fade));
      canvas.drawPath(poly([a.x + ux * 8, a.y + uy * 8, a.x - uy * 4, a.y + ux * 4, a.x + uy * 4, a.y - ux * 4]), fill(a.team === 0 ? elc : "#B38BE0", fade));
      canvas.drawLine(a.x - ux * len, a.y - uy * len, a.x - ux * (len - 8) - uy * 5, a.y - uy * (len - 8) + ux * 5, stroke(a.team === 0 ? "#E05A36" : "#3E2F4F", 2, fade));
    }

    // shockwaves
    for (const sw of e.shockwaves) {
      const a = 1 - sw.r / sw.maxR;
      for (const dir of [-1, 1]) {
        const x = sw.x + dir * sw.r;
        canvas.drawOval(rect(x - 30, GROUND_Y - 22, 60, 30), stroke("#E8D2A8", 6, a));
        canvas.drawPath(poly([x - 18, GROUND_Y, x, GROUND_Y - 40 * a, x + 18, GROUND_Y]), fill("#BBA58A", a));
      }
    }

    for (const b of e.bolts) drawBolt(canvas, b, e.t);

    // particles
    for (const p of e.particles) {
      if (!vis(p.x)) continue;
      const a = Math.max(0, p.life / p.maxLife);
      if (p.kind === "ember" || p.kind === "heal") canvas.drawCircle(p.x, p.y, p.size, glow(p.color, 2, a));
      else if (p.kind === "smoke") canvas.drawCircle(p.x, p.y, p.size * (2 - a), fill(p.color, a * 0.6));
      else if (p.kind === "shard") canvas.drawRect(rect(p.x, p.y, p.size * 1.6, p.size), fill(p.color, a));
      else canvas.drawCircle(p.x, p.y, p.size, fill(p.color, a));
    }
    canvas.restore();

    // floaters (screen space so text stays crisp)
    const small = opts.fonts.small;
    const big = opts.fonts.big;
    for (const fl of e.floaters) {
      const font = fl.big ? big : small;
      if (!font) continue;
      const sx = (fl.x - camX) * view.scale;
      const sy = (fl.y + view.offsetY) * view.scale;
      if (sx < -200 || sx > W + 200) continue;
      const a = Math.min(1, fl.life / (fl.maxLife * 0.5));
      const w = font.measureText(fl.text).width;
      canvas.drawText(fl.text, sx - w / 2 + 1.5, sy + 1.5, fill("#000000", a * 0.6), font);
      canvas.drawText(fl.text, sx - w / 2, sy, fill(fl.color, a), font);
    }

    const heavy = e.stage.hazard === "blizzard";
    drawAmbient(canvas, pal, W, H, e.t, heavy);
    if (e.focusT > 0) canvas.drawRect(rect(0, 0, W, H), fill("#5A3A9A", 0.18));
    drawVignette(canvas, W, H, e.player.hp / e.player.maxHp < 0.3 ? 1.6 : 1);
    if (e.player.hitFlash > 0) canvas.drawRect(rect(0, 0, W, H), fill("#D94E4E", e.player.hitFlash));
  }, { width: W, height: H });
}

// ---------------------------------------------------------------------------
// React view

export function SkiaPictureView({ picture, style, testID }: { picture: SkPicture | null; style: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <Canvas style={style} testID={testID}>
      {picture ? <Picture picture={picture} /> : null}
    </Canvas>
  );
}

export { GROUND_Y };
