import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/src/components/icon";
import { Body, Button, Caption, Card, Chip, EmptyState, Heading, IconButton, Label, Stars, Title } from "@/src/components/ui";
import { Vista } from "@/src/components/vista";
import { getMission, kingdomOf, SECRETS } from "@/src/game/missions";
import { ELEMENT_COLORS } from "@/src/game/palette";
import { ALLIES, DIFFICULTIES, ELEMENTS, elementUnlocked } from "@/src/game/rpg";
import type { AllyType, EnemyKind } from "@/src/game/types";
import { stageUnlocked } from "@/src/state/progression";
import { useSave } from "@/src/state/save";
import { makeStyles, radius, space, useTheme } from "@/src/theme";

const ENEMY_LABEL: Record<EnemyKind, string> = { grunt: "Brute", archer: "Archer", shield: "Shieldbearer", shaman: "Shaman", boss: "Boss", champion: "Champion", dummy: "Shield dummy" };
const ENEMY_ICON: Record<EnemyKind, string> = { grunt: "sword", archer: "bow-arrow", shield: "shield", shaman: "flash", boss: "crown", champion: "account-tie", dummy: "target" };
const HAZARD_LABEL = { none: "No hazard", geysers: "Erupting geysers", blizzard: "Blizzard & icicles", lightning: "Lightning strikes" } as const;
const ALLY_TYPES: AllyType[] = ["scout", "marksman", "tank"];
const ELEMENT_ICON: Record<string, string> = { normal: "arrow-up-bold", fire: "fire", ice: "snowflake", storm: "lightning-bolt", toxin: "biohazard" };

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { height: 200, overflow: "hidden" },
  heroOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, padding: space.lg, gap: 4 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  fact: { flexGrow: 1, flexBasis: 140, gap: 4, padding: space.md, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  enemy: { flexDirection: "row", alignItems: "center", gap: space.sm },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border },
}));

export default function MissionBriefing() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { stageId } = useLocalSearchParams<{ stageId: string }>();
  const { save, update } = useSave();
  const stage = getMission(String(stageId));

  if (!stage) {
    return (
      <View style={[s.root, { padding: space.lg, paddingTop: insets.top + space.lg }]}>
        <EmptyState testID="mission-not-found" icon="map" title="Unknown mission" body="This battlefield does not exist." action={<Button label="Back to map" testID="mission-back-map" onPress={() => router.replace("/(tabs)/story")} />} />
      </View>
    );
  }

  const unlocked = stageUnlocked(save, stage.id);
  const prog = save.progress.stages[stage.id];
  const kingdom = kingdomOf(stage.id);
  const isCoop = stage.type === "coop";
  const noAllies = stage.type === "duel" || stage.type === "training";

  // Enemy preview
  const counts = new Map<EnemyKind, number>();
  stage.groups.forEach((g) => g.spawns.forEach((sp) => counts.set(sp.kind, (counts.get(sp.kind) ?? 0) + sp.count)));
  if (stage.boss) counts.set("boss", 1);
  const secretDone = prog?.secretDone ?? false;
  const windMax = Math.min(120, Math.abs(stage.windBase) + stage.windVar * (stage.hazard === "blizzard" ? 2 : 1));
  const windMin = Math.max(0, Math.abs(stage.windBase) - stage.windVar * (stage.hazard === "blizzard" ? 2 : 1));

  return (
    <View style={s.root} testID="mission-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        <View style={s.hero}>
          <Vista biome={stage.biome} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} testID="mission-vista" />
          <View style={{ position: "absolute", top: insets.top + space.sm, left: space.lg }}>
            <IconButton icon="arrow-left" label="Back" testID="mission-back-button" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/story"))} />
          </View>
          <View style={s.heroOverlay}>
            <Label color="#FFFFFF">{kingdom ? kingdom.name : stage.kingdom === "arena" ? "Arena" : "Training Yard"}</Label>
            <Title color="#FFFFFF" testID="mission-title">
              {stage.name}
            </Title>
          </View>
        </View>

        <View style={{ padding: space.lg, gap: space.lg, maxWidth: 820, width: "100%", alignSelf: "center" }}>
          <Body>{stage.blurb}</Body>

          <View style={s.badges} testID="mission-objectives">
            <Chip icon="flag-checkered" label={stage.objective} selected testID="mission-objective-main" />
            {stage.type === "rescue" ? <Chip icon="account-heart" label="Keep every hostage alive" testID="mission-objective-hostages" /> : null}
            {stage.type === "defense" ? <Chip icon="gate" label="Gate above 50%" testID="mission-objective-gate" /> : null}
            {stage.type !== "rescue" && stage.type !== "defense" && stage.type !== "survival" && stage.type !== "training" ? <Chip icon="timer-outline" label={`Under ${stage.parTime}s`} testID="mission-objective-time" /> : null}
            {stage.secret ? <Chip icon="help-circle-outline" label={secretDone ? `Secret: ${SECRETS[stage.secret].name}` : "Secret: ???"} testID="mission-objective-secret" color={colors.brandSecondary} selected={secretDone} /> : null}
          </View>

          {prog ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <Stars count={prog.stars} size={20} testID="mission-stars" />
              <Caption>Best {prog.best.toLocaleString()}</Caption>
            </View>
          ) : null}

          <View style={s.facts}>
            <View style={s.fact} testID="mission-wind">
              <Icon name="weather-windy" size={20} color={colors.info} />
              <Caption>Wind</Caption>
              <Heading>
                {Math.round(windMin)}–{Math.round(windMax)}
              </Heading>
            </View>
            <View style={s.fact} testID="mission-hazard">
              <Icon name="alert-circle-outline" size={20} color={colors.warning} />
              <Caption>Hazard</Caption>
              <Heading>{HAZARD_LABEL[stage.hazard]}</Heading>
            </View>
            <View style={s.fact} testID="mission-level">
              <Icon name="sword" size={20} color={colors.brand} />
              <Caption>Recommended</Caption>
              <Heading>
                Lv {stage.recLevel} <Caption>(you: {save.profile.level})</Caption>
              </Heading>
            </View>
          </View>

          <Card testID="mission-enemies" style={{ gap: space.sm }}>
            <Label>{stage.type === "survival" ? "Endless waves of" : "Enemy forces"}</Label>
            {stage.boss ? (
              <View style={s.enemy}>
                <Icon name="crown" size={22} color={colors.brand} />
                <Heading>{stage.boss.name}</Heading>
                <Caption>{stage.boss.title}</Caption>
              </View>
            ) : null}
            {stage.champion ? (
              <View style={s.enemy}>
                <Icon name="account-tie" size={22} color={colors.brand} />
                <Heading>{stage.champion}</Heading>
              </View>
            ) : null}
            <View style={s.badges}>
              {[...counts.entries()]
                .filter(([k]) => k !== "boss" && k !== "champion")
                .map(([k, n]) => (
                  <Chip key={k} icon={ENEMY_ICON[k]} label={stage.type === "survival" ? ENEMY_LABEL[k] : `${n} × ${ENEMY_LABEL[k]}`} testID={`mission-enemy-${k}`} />
                ))}
              {stage.type === "survival" ? (["archer", "shield", "shaman"] as EnemyKind[]).map((k) => <Chip key={k} icon={ENEMY_ICON[k]} label={ENEMY_LABEL[k]} testID={`mission-enemy-${k}`} />) : null}
            </View>
          </Card>

          {!noAllies ? (
            <Card testID="mission-allies" style={{ gap: space.sm }}>
              <Label>{isCoop ? "Choose two allies" : "Choose your ally"}</Label>
              {isCoop ? (
                [0, 1].map((slot) => (
                  <View key={slot} style={s.badges}>
                    <Caption>Ally {slot + 1}</Caption>
                    {ALLY_TYPES.map((a) => (
                      <Chip
                        key={a}
                        label={ALLIES[a].name}
                        selected={save.equipped.coopAllies[slot] === a}
                        testID={`mission-coop-${slot}-${a}`}
                        onPress={() =>
                          update((d) => {
                            d.equipped.coopAllies[slot] = a;
                          })
                        }
                      />
                    ))}
                  </View>
                ))
              ) : (
                <View style={s.badges}>
                  {ALLY_TYPES.map((a) => (
                    <Chip key={a} label={ALLIES[a].name} selected={save.equipped.ally === a} testID={`mission-ally-${a}`} onPress={() => update((d) => void (d.equipped.ally = a))} />
                  ))}
                </View>
              )}
              <Caption>{isCoop ? save.equipped.coopAllies.map((a) => `${ALLIES[a].name}: ${ALLIES[a].blurb}`).join(" · ") : ALLIES[save.equipped.ally].blurb}</Caption>
            </Card>
          ) : null}

          <Card testID="mission-loadout" style={{ gap: space.sm }}>
            <Label>Arrows</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {ELEMENTS.map((el) => {
                const ok = elementUnlocked(el.id, save.profile.level);
                return (
                  <Chip
                    key={el.id}
                    testID={`mission-element-${el.id}`}
                    label={ok ? el.name : `Lv ${el.level}`}
                    icon={ok ? ELEMENT_ICON[el.id] : "lock"}
                    color={ELEMENT_COLORS[el.id]}
                    disabled={!ok}
                    selected={save.equipped.element === el.id}
                    onPress={() => update((d) => void (d.equipped.element = el.id))}
                  />
                );
              })}
            </ScrollView>
            <Label>Difficulty</Label>
            <View style={s.badges}>
              {DIFFICULTIES.map((d) => (
                <Chip key={d.id} label={d.name} selected={save.progress.difficulty === d.id} testID={`mission-difficulty-${d.id}`} onPress={() => update((x) => void (x.progress.difficulty = d.id))} />
              ))}
            </View>
            <Caption>{DIFFICULTIES.find((d) => d.id === save.progress.difficulty)?.desc}</Caption>
          </Card>
        </View>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button
          large
          testID="mission-deploy-button"
          icon={unlocked ? "sword-cross" : "lock"}
          label={unlocked ? "Deploy to Battle" : "Locked"}
          disabled={!unlocked}
          onPress={() => router.replace({ pathname: "/combat/[stageId]", params: { stageId: stage.id } })}
        />
      </View>
    </View>
  );
}
