"use no memo";
// Combat view pieces: frame loop canvas, gesture pads, HUD overlay, keyboard bindings, tutorial.
// The engine is a mutable object; these components read from it on their own clocks
// (canvas: every frame, HUD: 10 Hz) so React work stays small.

import type { SkFont, SkPicture } from "@shopify/react-native-skia";
import { BlurView } from "expo-blur";
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { audio } from "@/src/game/audio";
import type { Engine } from "@/src/game/engine";
import { ELEMENT_COLORS } from "@/src/game/palette";
import { computeView, renderFrame, SkiaPictureView } from "@/src/game/render";
import { ABILITIES, ELEMENTS } from "@/src/game/rpg";
import type { Element, HudSnapshot } from "@/src/game/types";
import { fonts, radius, space, useTheme } from "@/src/theme";

import { useLatest } from "@/src/utils/use-latest";

import { Icon } from "./icon";

const ELEMENT_ICON: Record<Element, string> = { normal: "arrow-up-bold", fire: "fire", ice: "snowflake", storm: "lightning-bolt", toxin: "biohazard" };

// ---------------------------------------------------------------------------
// Frame loop + canvas

export function CombatCanvas({
  engine,
  width,
  height,
  paused,
  trajectorySteps,
  fonts: skFonts,
  onFrame,
}: {
  engine: Engine;
  width: number;
  height: number;
  paused: boolean;
  trajectorySteps: number;
  fonts: { small: SkFont | null; big: SkFont | null };
  onFrame?: (dt: number) => void;
}) {
  const [pic, setPic] = useState<SkPicture | null>(null);
  const pausedRef = useLatest(paused);
  const fontsRef = useLatest(skFonts);
  const onFrameRef = useLatest(onFrame);

  useEffect(() => {
    if (!width || !height) return;
    const view = computeView(width, height);
    let raf = 0;
    let last = 0;
    const loop = (ts: number) => {
      const dt = last ? (ts - last) / 1000 : 1 / 60;
      last = ts;
      if (!pausedRef.current) {
        onFrameRef.current?.(dt);
        engine.update(dt);
        for (const ev of engine.drainEvents()) audio.playEvent(ev.type);
      }
      setPic(renderFrame(engine, view, { trajectorySteps, fonts: fontsRef.current }));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine, width, height, trajectorySteps, pausedRef, fontsRef, onFrameRef]);

  return <SkiaPictureView picture={pic} style={{ width, height }} testID="combat-canvas" />;
}

// ---------------------------------------------------------------------------
// Gesture surfaces (RNGH v3 — simultaneous multi-touch across separate detectors)

/** Full-screen slingshot: touch down = draw, drag = aim, release = loose. */
export function AimSurface({ engine, style, disabled }: { engine: Engine; style: StyleProp<ViewStyle>; disabled: boolean }) {
  const disabledRef = useLatest(disabled);
  const pan = usePanGesture({
    runOnJS: true,
    minDistance: 0,
    onBegin: () => {
      if (disabledRef.current) return;
      audio.unlock();
      engine.beginDraw();
    },
    onUpdate: (e) => {
      if (disabledRef.current) return;
      engine.aimDelta(e.translationX, e.translationY);
    },
    onFinalize: () => {
      if (disabledRef.current) return engine.cancelDraw();
      engine.releaseDraw();
    },
  });
  return (
    <GestureDetector gesture={pan}>
      <View style={style} testID="combat-aim-surface" accessibilityLabel="Battlefield: drag to aim, release to shoot" />
    </GestureDetector>
  );
}

/** Press-and-hold pad (movement) or instant-press button (abilities). */
export function HoldPad({ onDown, onUp, children, style, testID, label }: { onDown: () => void; onUp?: () => void; children: React.ReactNode; style: StyleProp<ViewStyle>; testID: string; label: string }) {
  const downRef = useLatest(onDown);
  const upRef = useLatest(onUp);
  const [pressed, setPressed] = useState(false);
  const g = usePanGesture({
    runOnJS: true,
    minDistance: 0,
    onBegin: () => {
      setPressed(true);
      downRef.current();
    },
    onFinalize: () => {
      setPressed(false);
      upRef.current?.();
    },
  });
  return (
    <GestureDetector gesture={g}>
      <View style={[style, pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }]} testID={testID} accessibilityRole="button" accessibilityLabel={label}>
        {children}
      </View>
    </GestureDetector>
  );
}

// ---------------------------------------------------------------------------
// Keyboard (web) — controller-ready action map

export function useKeyboardControls(engine: Engine, opts: { onPause: () => void; onCycleElement: () => void; enabled: boolean }) {
  const optsRef = useLatest(opts);
  const held = useRef(new Set<string>());

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const updateMove = () => {
      const l = held.current.has("a") || held.current.has("arrowleft");
      const r = held.current.has("d") || held.current.has("arrowright");
      engine.setMove(l && !r ? -1 : r && !l ? 1 : 0);
    };
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!optsRef.current.enabled && k !== "escape") return;
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      if (e.repeat) return;
      held.current.add(k);
      if (k === " ") {
        audio.unlock();
        engine.beginDraw();
      } else if (k === "a" || k === "d" || k === "arrowleft" || k === "arrowright") updateMove();
      else if (k >= "1" && k <= "4") engine.useAbility(Number(k) - 1);
      else if (k === "q") optsRef.current.onCycleElement();
      else if (k === "escape") optsRef.current.onPause();
      else if (k === "f") engine.setFacing(engine.player.facing === 1 ? -1 : 1);
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      held.current.delete(k);
      if (k === " ") {
        // Never loose an arrow while paused / in a modal — just drop the draw.
        if (optsRef.current.enabled) engine.releaseDraw();
        else engine.cancelDraw();
      }
      else if (k === "a" || k === "d" || k === "arrowleft" || k === "arrowright") updateMove();
    };
    const blur = () => {
      held.current.clear();
      engine.setMove(0);
      engine.cancelDraw();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [engine, optsRef]);

  /** Continuous aim from held keys; call every frame. */
  return (dt: number) => {
    const h = held.current;
    if (h.has("w") || h.has("arrowup")) engine.aimNudge(1.3 * dt);
    if (h.has("s") || h.has("arrowdown")) engine.aimNudge(-1.3 * dt);
  };
}

// ---------------------------------------------------------------------------
// HUD

function Bar({ value, color, track, height = 10, testID }: { value: number; color: string; track: string; height?: number; testID?: string }) {
  return (
    <View testID={testID} style={{ height, borderRadius: height, backgroundColor: track, overflow: "hidden" }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: "100%", backgroundColor: color, borderRadius: height }} />
    </View>
  );
}

function Glass({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <View testID={testID} style={[{ borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }, style]}>
      <BlurView intensity={30} tint="dark" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(18,19,24,0.45)" }} />
      <View style={{ padding: space.sm, gap: 4 }}>{children}</View>
    </View>
  );
}

export function useHud(engine: Engine, hz = 10): HudSnapshot {
  const [hud, setHud] = useState<HudSnapshot>(() => engine.hud());
  useEffect(() => {
    const id = setInterval(() => setHud(engine.hud()), 1000 / hz);
    return () => clearInterval(id);
  }, [engine, hz]);
  return hud;
}

export function CombatHud({
  engine,
  hud,
  onPause,
  unlockedElements,
  onElement,
}: {
  engine: Engine;
  hud: HudSnapshot;
  onPause: () => void;
  unlockedElements: Element[];
  onElement: (el: Element) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const t = { color: "#F4F5F7", fontFamily: fonts.bodySemi, fontSize: 12 } as const;
  const windPct = Math.abs(hud.wind) / 120;
  const windDir = hud.wind >= 0 ? 1 : -1;
  const L = Math.max(insets.left, space.md);
  const R = Math.max(insets.right, space.md);
  const { width: winW } = useWindowDimensions();
  const narrow = winW < 640; // phone portrait: stack wind under score, 2×2 ability grid
  const panelW = narrow ? Math.min(200, winW * 0.5) : 230;
  const abilitySize = narrow ? 50 : 56;

  return (
    <>
      {/* Top-left: HP, objective */}
      <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + space.sm, left: L, width: panelW, gap: space.sm }}>
        <Glass testID="combat-hp">
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={t}>HP</Text>
            <Text style={t} testID="combat-hp-value">
              {Math.ceil(hud.hp)}/{Math.round(hud.maxHp)}
            </Text>
          </View>
          <Bar value={hud.hp / hud.maxHp} color={hud.hp / hud.maxHp < 0.3 ? colors.error : colors.success} track="rgba(255,255,255,0.12)" />
          <Bar value={hud.draw} color={hud.draw >= 1 ? colors.brandSecondary : colors.brand} track="rgba(255,255,255,0.08)" height={5} testID="combat-draw-meter" />
          {hud.allies.length ? (
            <View style={{ flexDirection: "row", gap: 6 }}>
              {hud.allies.map((a, i) => (
                <View key={i} style={{ flex: 1, opacity: a.alive ? 1 : 0.35 }}>
                  <Bar value={a.hp / a.maxHp} color={colors.info} track="rgba(255,255,255,0.08)" height={4} />
                </View>
              ))}
            </View>
          ) : null}
        </Glass>
        <Glass testID="combat-objective">
          <Text style={[t, { fontFamily: fonts.display, fontSize: 13 }]} numberOfLines={2}>
            {hud.objective}
          </Text>
          <Text style={[t, { color: "#C5C8D4", fontFamily: fonts.body }]} testID="combat-objective-progress">
            {hud.progress}
          </Text>
          {hud.hostages.length ? (
            <View style={{ flexDirection: "row", gap: 4 }} testID="combat-hostages">
              {hud.hostages.map((h, i) => (
                <Icon key={i} name={!h.alive ? "skull" : h.saved ? "account-heart" : h.freed ? "run-fast" : "lock"} size={16} color={!h.alive ? colors.error : h.saved ? colors.success : h.freed ? colors.brandSecondary : "#C5C8D4"} />
              ))}
            </View>
          ) : null}
          {hud.gate ? <Bar value={hud.gate.hp / hud.gate.maxHp} color={colors.brandSecondary} track="rgba(255,255,255,0.1)" height={6} testID="combat-gate-bar" /> : null}
          {hud.escort ? <Bar value={hud.escort.hp / hud.escort.maxHp} color="#B38BE0" track="rgba(255,255,255,0.1)" height={6} testID="combat-escort-bar" /> : null}
        </Glass>
      </View>

      {/* Top-center: wind + boss */}
      <View pointerEvents="none" style={narrow ? { position: "absolute", top: insets.top + 124, right: R, alignItems: "flex-end", gap: space.sm, maxWidth: winW - panelW - L - R - space.sm } : { position: "absolute", top: insets.top + space.sm, left: 0, right: 0, alignItems: "center", gap: space.sm }}>
        <Glass testID="combat-wind-indicator" style={{ minWidth: narrow ? 120 : 150 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Icon name="weather-windy" size={16} color="#BFE6FF" />
            <Text style={[t, { fontFamily: fonts.display }]}>
              {windDir < 0 ? "◀ " : ""}
              {Math.round(Math.abs(hud.wind))}
              {windDir > 0 ? " ▶" : ""}
            </Text>
          </View>
          <View style={{ height: 5, flexDirection: "row", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 5, overflow: "hidden" }}>
            <View style={{ flex: 1, alignItems: "flex-end" }}>{windDir < 0 ? <View style={{ width: `${windPct * 100}%`, height: "100%", backgroundColor: "#8FD3FF" }} /> : null}</View>
            <View style={{ width: 2, backgroundColor: "#FFFFFF" }} />
            <View style={{ flex: 1 }}>{windDir > 0 ? <View style={{ width: `${windPct * 100}%`, height: "100%", backgroundColor: "#8FD3FF" }} /> : null}</View>
          </View>
        </Glass>
        {hud.boss ? (
          <Glass testID="combat-boss-bar" style={{ width: narrow ? 170 : 340, maxWidth: narrow ? undefined : "70%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[t, { fontFamily: fonts.displayHeavy, fontSize: 13, letterSpacing: 1 }]}>{hud.boss.name}</Text>
              <View style={{ flexDirection: "row", gap: 4 }}>
                {[1, 2, 3].map((p) => (
                  <View key={p} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: hud.boss!.phase >= p ? colors.error : "rgba(255,255,255,0.2)" }} />
                ))}
              </View>
            </View>
            <Bar value={hud.boss.hp / hud.boss.maxHp} color={colors.error} track="rgba(255,255,255,0.1)" height={8} />
          </Glass>
        ) : null}
      </View>

      {/* Top-right: score + pause */}
      <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + space.sm, right: R, alignItems: "flex-end", gap: space.sm }}>
        <Pressable
          testID="combat-pause-button"
          accessibilityRole="button"
          accessibilityLabel="Pause"
          onPress={onPause}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(18,19,24,0.6)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }}
        >
          <Icon name="pause" size={22} color="#F4F5F7" />
        </Pressable>
        <Glass testID="combat-score">
          <Text style={[t, { fontFamily: fonts.display, fontSize: 16, textAlign: "right" }]}>{hud.score.toLocaleString()}</Text>
          <Text style={[t, { color: "#C5C8D4", textAlign: "right" }]}>
            {Math.floor(hud.time)}s{hud.streak >= 3 ? ` · streak ×${hud.streak}` : ""}
          </Text>
        </Glass>
      </View>

      {/* Bottom-right: elements + abilities */}
      <View pointerEvents="box-none" style={{ position: "absolute", right: R, bottom: insets.bottom + space.md, alignItems: "flex-end", gap: space.sm, maxWidth: "62%" }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} testID="combat-element-selector">
          {unlockedElements.map((el) => {
            const sel = hud.element === el;
            return (
              <Pressable
                key={el}
                testID={`combat-element-${el}`}
                accessibilityRole="button"
                accessibilityLabel={`${el} arrows`}
                onPress={() => onElement(el)}
                style={{ flexShrink: 0, height: 44, minWidth: 44, paddingHorizontal: 10, borderRadius: 22, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: sel ? ELEMENT_COLORS[el] : "rgba(18,19,24,0.6)", borderWidth: 1, borderColor: ELEMENT_COLORS[el] }}
              >
                <Icon name={ELEMENT_ICON[el]} size={18} color={sel ? "#121318" : ELEMENT_COLORS[el]} />
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, width: narrow ? abilitySize * 2 + 8 : undefined }}>
          {hud.abilities.map((a, i) => {
            const ready = a.cd <= 0;
            const def = ABILITIES[a.id];
            return (
              <HoldPad
                key={a.id}
                testID={`combat-ability-${i + 1}`}
                label={`${def.name}${ready ? "" : `, ${Math.ceil(a.cd)} seconds`}`}
                onDown={() => engine.useAbility(i)}
                style={{
                  width: abilitySize,
                  height: abilitySize,
                  borderRadius: abilitySize / 2,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: a.armed || a.active ? colors.brandSecondary : ready ? "rgba(224,90,54,0.85)" : "rgba(18,19,24,0.7)",
                  borderWidth: 2,
                  borderColor: ready ? colors.brand : "rgba(255,255,255,0.15)",
                }}
              >
                <Icon name={def.glyph} size={24} color={ready || a.armed ? "#FFFFFF" : "#8C91A3"} />
                {!ready ? <Text style={{ position: "absolute", bottom: 4, color: "#F4F5F7", fontFamily: fonts.display, fontSize: 11 }}>{Math.ceil(a.cd)}</Text> : null}
                <Text style={{ position: "absolute", top: -2, right: 2, color: "#C5C8D4", fontFamily: fonts.bodyBold, fontSize: 9 }}>{i + 1}</Text>
              </HoldPad>
            );
          })}
        </View>
      </View>

      {/* Bottom-left: movement pads */}
      <View pointerEvents="box-none" style={{ position: "absolute", left: L, bottom: insets.bottom + space.md, flexDirection: "row", gap: space.sm }}>
        {([-1, 1] as const).map((dir) => (
          <HoldPad
            key={dir}
            testID={dir < 0 ? "combat-move-left" : "combat-move-right"}
            label={dir < 0 ? "Move left" : "Move right"}
            onDown={() => engine.setMove(dir)}
            onUp={() => engine.setMove(0)}
            style={{ width: 64, height: 64, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(18,19,24,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
          >
            <Icon name={dir < 0 ? "chevron-left" : "chevron-right"} size={36} color="#F4F5F7" />
          </HoldPad>
        ))}
      </View>

      {/* Focus vignette label */}
      {hud.focus ? (
        <View pointerEvents="none" style={{ position: "absolute", bottom: insets.bottom + 96, left: 0, right: 0, alignItems: "center" }}>
          <Text style={{ color: "#C8A8FF", fontFamily: fonts.displayHeavy, letterSpacing: 4 }}>FOCUS</Text>
        </View>
      ) : null}

      {/* Boss / duel intro card */}
      {hud.introCard ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, alignItems: "center", justifyContent: "center" }} testID="combat-intro-card">
          <View style={{ backgroundColor: "rgba(0,0,0,0.6)", paddingVertical: space.lg, paddingHorizontal: space["2xl"], borderRadius: radius.lg, alignItems: "center" }}>
            <Text style={{ color: colors.brand, fontFamily: fonts.displayHeavy, fontSize: 34, letterSpacing: 3 }}>{hud.introCard.title}</Text>
            <Text style={{ color: "#E2E4EB", fontFamily: fonts.bodySemi, fontSize: 14 }}>{hud.introCard.subtitle}</Text>
          </View>
        </View>
      ) : null}
    </>
  );
}

export function unlockedElementsFor(level: number): Element[] {
  return ELEMENTS.filter((e) => level >= e.level).map((e) => e.id);
}

// ---------------------------------------------------------------------------
// First-time tutorial coach marks

const COACH = [
  { icon: "gesture-swipe", title: "Drag to aim", body: "Touch anywhere on the battlefield and drag back — like a slingshot. Pull down-left to aim up-right." },
  { icon: "weather-windy", title: "Watch the wind", body: "The wind meter (top) bends your arrows. The dotted arc already includes it." },
  { icon: "bow-arrow", title: "Release to loose", body: "Hold to draw power, release to fire. Aim for heads for double damage. On keyboard: hold Space, W/S to aim, A/D to move." },
];

export function Tutorial({ onDone }: { onDone: () => void }) {
  const { colors } = useTheme();
  const [i, setI] = useState(0);
  const c = COACH[i];
  return (
    <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: space.lg }} testID="combat-tutorial">
      <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: space.xl, gap: space.md, maxWidth: 420, width: "100%", borderWidth: 1, borderColor: colors.border }}>
        <Icon name={c.icon} size={36} color={colors.brand} />
        <Text style={{ color: colors.onSurface, fontFamily: fonts.display, fontSize: 22 }}>{c.title}</Text>
        <Text style={{ color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: 15, lineHeight: 22 }}>{c.body}</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: colors.muted, fontFamily: fonts.bodySemi }}>
            {i + 1}/{COACH.length}
          </Text>
          <Pressable
            testID="combat-tutorial-next"
            accessibilityRole="button"
            onPress={() => {
              audio.unlock();
              if (i < COACH.length - 1) setI(i + 1);
              else onDone();
            }}
            style={{ minHeight: 44, paddingHorizontal: space.xl, borderRadius: radius.md, backgroundColor: colors.brand, justifyContent: "center" }}
          >
            <Text style={{ color: colors.onBrand, fontFamily: fonts.display, fontSize: 16 }}>{i < COACH.length - 1 ? "Next" : "Let's go"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
