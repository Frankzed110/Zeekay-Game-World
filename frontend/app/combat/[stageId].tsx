"use no memo";
import { useFont } from "@shopify/react-native-skia";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, View, type LayoutChangeEvent } from "react-native";

import { api } from "@/src/api/client";
import { AimSurface, CombatCanvas, CombatHud, Tutorial, unlockedElementsFor, useHud, useKeyboardControls } from "@/src/components/combat";
import { Icon } from "@/src/components/icon";
import { Body, Button, Caption, EmptyState, Heading, Label, Sheet, Stars, Title } from "@/src/components/ui";
import { audio, KINGDOM_MUSIC } from "@/src/game/audio";
import { Engine } from "@/src/game/engine";
import { getMission, kingdomOf, nextStageId, SECRETS, TOURNAMENT_ROUNDS } from "@/src/game/missions";
import { MATERIALS } from "@/src/game/rpg";
import type { Element, StageDef } from "@/src/game/types";
import { applyMissionResult, loadoutFromSave, type ApplyOutcome } from "@/src/state/progression";
import { useSave } from "@/src/state/save";
import { space, useTheme } from "@/src/theme";

export default function CombatScreen() {
  const { stageId } = useLocalSearchParams<{ stageId: string }>();
  const stage = getMission(String(stageId));
  const [runId, setRunId] = useState(0);
  const { colors } = useTheme();

  if (!stage) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, padding: space.lg, justifyContent: "center" }}>
        <EmptyState testID="combat-not-found" icon="map" title="Unknown battlefield" body="This mission does not exist." action={<Button label="Back to map" testID="combat-back-map" onPress={() => router.replace("/(tabs)/story")} />} />
      </View>
    );
  }
  return <CombatRun key={`${stage.id}:${runId}`} stage={stage} onRetry={() => setRunId((r) => r + 1)} />;
}

function CombatRun({ stage, onRetry }: { stage: StageDef; onRetry: () => void }) {
  const { colors } = useTheme();
  const { save, update, replace, playerKey, syncNow } = useSave();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [paused, setPaused] = useState(false);
  const [tutorial, setTutorial] = useState(!save.progress.tutorialDone && stage.kingdom !== "arena");
  const [outcome, setOutcome] = useState<ApplyOutcome | null>(null);
  const applied = useRef(false);
  const small = useFont(require("@/assets/fonts/Outfit-Bold.ttf"), 16);
  const big = useFont(require("@/assets/fonts/Outfit-ExtraBold.ttf"), 22);

  // Build the engine once per run from the current save.
  const engine = useMemo(() => {
    const player = loadoutFromSave(save);
    const allies = stage.type === "duel" || stage.type === "training" ? [] : stage.type === "coop" ? [...save.equipped.coopAllies] : [save.equipped.ally];
    return new Engine({ stage, difficulty: save.progress.difficulty, player, allies, tutorial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hud = useHud(engine);
  const elements = useMemo(() => unlockedElementsFor(save.profile.level), [save.profile.level]);
  const cycleElement = useCallback(() => {
    const i = elements.indexOf(engine.element);
    engine.setElement(elements[(i + 1) % elements.length]);
  }, [elements, engine]);
  const setElement = useCallback((el: Element) => engine.setElement(el), [engine]);

  const blocked = paused || tutorial || !!outcome;
  useEffect(() => {
    if (blocked) {
      engine.cancelDraw();
      engine.setMove(0);
    }
  }, [blocked, engine]);
  const keyAim = useKeyboardControls(engine, { onPause: () => setPaused((p) => !p), onCycleElement: cycleElement, enabled: !blocked });

  // Music per kingdom / boss
  useEffect(() => {
    const k = kingdomOf(stage.id);
    audio.playMusic(stage.music === "boss" ? "boss" : k ? KINGDOM_MUSIC[k.id] : stage.music);
  }, [stage]);

  // Auto-pause when app is backgrounded
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st !== "active") setPaused(true);
    });
    return () => sub.remove();
  }, []);

  // Results: apply progression once, shortly after the mission ends
  const queryClient = useQueryClient();
  const submit = useMutation({
    mutationFn: api.submitScore,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["champions"] }),
  });
  const submitMutate = submit.mutate;
  useEffect(() => {
    if (!hud.over || applied.current || engine.overT < 1.2 || !engine.result) return;
    applied.current = true;
    const out = applyMissionResult(save, stage, engine.result, save.progress.difficulty, engine.goldFound);
    replace(out.save);
    setOutcome(out);
    if (out.rewards.levelsGained > 0) setTimeout(() => audio.play("levelup"), 900);
    if (out.submit && playerKey && api.hasBackend()) {
      submitMutate({ player_key: playerKey, display_name: out.save.profile.name, difficulty: save.progress.difficulty, meta: { stars: engine.result.stars.filter(Boolean).length, time: engine.result.time }, ...out.submit });
    }
    setTimeout(syncNow, 50);
  }, [hud, engine, save, stage, replace, playerKey, submitMutate, syncNow]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: Math.round(width), h: Math.round(height) });
  };

  const quit = () => {
    setPaused(false);
    router.replace({ pathname: "/mission/[stageId]", params: { stageId: stage.id } });
  };


  return (
    <View style={{ flex: 1, backgroundColor: "#000" }} onLayout={onLayout} testID="combat-screen">
      {size.w > 0 ? (
        <CombatCanvas
          engine={engine}
          width={size.w}
          height={size.h}
          paused={blocked}
          trajectorySteps={save.progress.difficulty === "legend" ? 8 : 26}
          fonts={{ small, big }}
          onFrame={keyAim}
        />
      ) : null}
      <AimSurface engine={engine} disabled={blocked} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      <CombatHud engine={engine} hud={hud} onPause={() => setPaused(true)} unlockedElements={elements} onElement={setElement} />

      {tutorial ? (
        <Tutorial
          onDone={() => {
            setTutorial(false);
            update((d) => void (d.progress.tutorialDone = true));
          }}
        />
      ) : null}

      <Sheet visible={paused && !outcome} onClose={() => setPaused(false)} testID="pause-modal">
        <Label>Paused</Label>
        <Title>{stage.name}</Title>
        <Caption>{stage.objective}</Caption>
        <Button icon="play" label="Resume" testID="pause-resume-button" onPress={() => setPaused(false)} />
        <Button
          variant="secondary"
          icon="refresh"
          label="Restart"
          testID="pause-restart-button"
          onPress={() => {
            setPaused(false);
            onRetry();
          }}
        />
        <Button variant="ghost" icon="close" label="Abandon mission" testID="pause-quit-button" onPress={quit} />
      </Sheet>

      {outcome && engine.result ? (
        <Results
          stage={stage}
          outcome={outcome}
          engine={engine}
          rank={submit.data?.rank ?? null}
          submitting={submit.isPending}
          submitError={submit.isError}
          onRetry={onRetry}
          colors={colors}
        />
      ) : null}
    </View>
  );
}

function Results({
  stage,
  outcome,
  engine,
  rank,
  submitting,
  submitError,
  onRetry,
  colors,
}: {
  stage: StageDef;
  outcome: ApplyOutcome;
  engine: Engine;
  rank: number | null;
  submitting: boolean;
  submitError: boolean;
  onRetry: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const r = engine.result!;
  const rw = outcome.rewards;
  const survival = stage.type === "survival";
  const won = r.victory || survival;
  const next = r.victory ? nextStageId(stage.id) : null;
  const tour = rw.tournament;
  const accuracy = r.shots ? Math.round((Math.min(r.hits, r.shots) / r.shots) * 100) : 0;

  const primary = () => {
    if (tour?.practice) {
      router.dismissTo("/(tabs)/arena");
    } else if (tour && !tour.finished && tour.nextRound !== null) {
      router.replace({ pathname: "/combat/[stageId]", params: { stageId: `arena_tournament-${tour.nextRound + 1}` } });
    } else if (rw.unlockedStage) {
      router.replace({ pathname: "/mission/[stageId]", params: { stageId: rw.unlockedStage } });
    } else if (next && stage.kingdom !== "arena" && stage.kingdom !== "training") {
      router.replace({ pathname: "/mission/[stageId]", params: { stageId: next } });
    } else {
      router.dismissTo(stage.kingdom === "arena" || stage.kingdom === "training" ? "/(tabs)/arena" : "/(tabs)/story");
    }
  };
  const primaryLabel = tour?.practice ? "Back to Arena" : tour && !tour.finished ? `Next: ${TOURNAMENT_ROUNDS[tour.nextRound ?? 0].round}` : rw.unlockedStage || next ? "Continue" : stage.kingdom === "arena" || stage.kingdom === "training" ? "Back to Arena" : "Back to Map";

  return (
    <Sheet visible onClose={() => {}} dismissable={false} testID="results-modal">
      <Label color={won ? colors.success : colors.error}>{survival ? "Run complete" : r.victory ? "Victory" : "Defeat"}</Label>
      <Title testID="results-title">{survival ? `Wave ${r.wave} reached` : r.victory ? (stage.type === "boss" ? "The Sunshard glows brighter" : "Mission complete") : "You have fallen"}</Title>
      <Stars count={r.stars.filter(Boolean).length} size={28} testID="results-stars" />
      {r.secretDone && stage.secret ? (
        <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }} testID="results-secret">
          <Icon name="star-four-points" size={18} color={colors.brandSecondary} />
          <Body color={colors.brandSecondary}>
            Secret: {SECRETS[stage.secret].name}
            {rw.secretFirstTime ? " — badge earned! +500" : ""}
          </Body>
        </View>
      ) : null}
      {tour ? (
        <Body testID="results-tournament">{tour.practice ? "Practice round — the bracket is unchanged." : tour.finished ? (tour.won ? `🏆 Tournament champion! Total ${tour.total.toLocaleString()}` : `Eliminated. Tournament total ${tour.total.toLocaleString()}`) : `Round won — ${TOURNAMENT_ROUNDS[tour.nextRound ?? 0].champion} awaits.`}</Body>
      ) : null}

      <View style={{ gap: 4 }} testID="results-breakdown">
        {r.breakdown.map((l) => (
          <View key={l.label} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Caption>{l.label}</Caption>
            <Caption color={l.value < 0 ? colors.error : colors.onSurface}>
              {l.value > 0 ? "+" : ""}
              {l.value.toLocaleString()}
            </Caption>
          </View>
        ))}
        <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 6 }}>
          <Heading>Score</Heading>
          <Heading testID="results-score">{r.score.toLocaleString()}</Heading>
        </View>
        <Caption>
          Accuracy {accuracy}% · Kills {r.kills} · Headshots {r.headshots} · {r.time}s{rw.newBest ? " · NEW BEST" : ""}
        </Caption>
      </View>

      <View style={{ gap: 4 }} testID="results-rewards">
        <Label>Rewards</Label>
        <Body color={colors.onSurface}>
          +{rw.xp} XP · +{rw.gold} gold
          {Object.entries(rw.materials)
            .map(([m, n]) => ` · +${n} ${MATERIALS.find((x) => x.id === m)?.name}`)
            .join("")}
        </Body>
        {rw.levelsGained > 0 ? (
          <Body color={colors.brandSecondary} testID="results-levelup">
            Level up! Now level {rw.newLevel} — +{rw.levelsGained * 3} attribute points in the Armory.
          </Body>
        ) : null}
        {rw.unlockedKingdom ? <Body color={colors.success}>New kingdom unlocked: {rw.unlockedKingdom}</Body> : rw.unlockedStage ? <Body color={colors.success}>New stage unlocked</Body> : null}
        {outcome.submit ? (
          <Caption testID="results-rank">{!api.hasBackend() ? "Leaderboards offline" : submitting ? "Posting score…" : submitError ? "Score saved locally (offline)" : rank ? `Arena rank #${rank}` : ""}</Caption>
        ) : null}
      </View>

      <Button large icon="arrow-right" label={primaryLabel} testID="results-continue-button" onPress={primary} />
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button style={{ flex: 1 }} variant="secondary" icon="refresh" label={tour && !tour.finished && !tour.practice ? "Practice again" : "Retry"} testID="results-retry-button" onPress={onRetry} />
        <Button style={{ flex: 1 }} variant="ghost" icon="map" label="Map" testID="results-map-button" onPress={() => router.dismissTo("/(tabs)/story")} />
      </View>
    </Sheet>
  );
}
