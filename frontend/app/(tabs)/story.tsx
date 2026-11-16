import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/src/components/icon";
import { Body, Button, Caption, Heading, IconButton, Label, ProgressBar, Stars, tap, Title } from "@/src/components/ui";
import { getMission, KINGDOMS, STORY } from "@/src/game/missions";
import { BIOMES } from "@/src/game/palette";
import { xpForLevel } from "@/src/game/rpg";
import { nextStoryStage, stageUnlocked, totalStars } from "@/src/state/progression";
import { useSave } from "@/src/state/save";
import { fonts, makeStyles, radius, space, TOUCH, useTheme } from "@/src/theme";

const TYPE_ICON: Record<string, string> = { clear: "sword", rescue: "account-heart", escort: "run-fast", defense: "gate", boss: "crown", waves: "shield-sword" };

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  profile: { flex: 1, gap: 6 },
  kingdom: { borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary },
  banner: { padding: space.lg, gap: 4 },
  bannerTitle: { fontFamily: fonts.displayHeavy, fontSize: 24, color: "#FFFFFF" },
  bannerSub: { fontFamily: fonts.bodySemi, fontSize: 13, color: "rgba(255,255,255,0.85)" },
  bannerMeta: { flexDirection: "row", gap: space.md, flexWrap: "wrap", marginTop: space.xs },
  bannerChip: { flexDirection: "row", gap: 4, alignItems: "center" },
  bannerChipText: { fontFamily: fonts.bodySemi, fontSize: 12, color: "rgba(255,255,255,0.9)" },
  stages: { padding: space.md, gap: space.sm },
  node: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, minHeight: 64 },
  nodeBoss: { minHeight: 80, borderWidth: 1, borderColor: c.brand },
  nodeLocked: { opacity: 0.5 },
  nodeIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  nodeIconBoss: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.brandTertiary },
  lockedCard: { padding: space.lg, gap: 4 },
  quick: { position: "absolute", left: space.lg, right: space.lg, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border },
}));

export default function StoryScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { save } = useSave();
  const next = getMission(nextStoryStage(save))!;
  const xpNeed = xpForLevel(save.profile.level);

  const open = (id: string) => router.push({ pathname: "/mission/[stageId]", params: { stageId: id } });

  return (
    <View style={s.root} testID="story-screen">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + 120, paddingHorizontal: space.lg, gap: space.lg, maxWidth: 900, width: "100%", alignSelf: "center" }}>
        <View style={s.header}>
          <View style={s.profile}>
            <Label>The Shattered Sunshard</Label>
            <Title testID="story-player-name">{save.profile.name}</Title>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Caption testID="story-player-level">Lv {save.profile.level}</Caption>
              <View style={{ flex: 1, maxWidth: 200 }}>
                <ProgressBar value={save.profile.xp / xpNeed} color={colors.brandSecondary} height={6} testID="story-xp-bar" />
              </View>
              <Icon name="star" size={14} color={colors.brandSecondary} />
              <Caption testID="story-total-stars">{totalStars(save)}/36</Caption>
              <Icon name="cash" size={14} color={colors.brandSecondary} />
              <Caption testID="story-gold">{save.profile.gold}</Caption>
            </View>
          </View>
          <IconButton icon="home" label="Title screen" testID="story-home-button" onPress={() => router.replace("/")} />
          <IconButton icon="cog" label="Settings" testID="story-settings-button" onPress={() => router.push("/settings")} />
        </View>

        <Body>{STORY.text}</Body>

        {KINGDOMS.map((k) => {
          const pal = BIOMES[k.id];
          const unlocked = k.index <= save.progress.kingdomsUnlocked;
          const shardRestored = (save.progress.stages[k.stages[2]]?.stars ?? 0) > 0;
          return (
            <View key={k.id} style={s.kingdom} testID={`story-kingdom-${k.id}`}>
              <LinearGradient colors={unlocked ? pal.banner : [colors.surfaceTertiary, colors.surfaceSecondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.banner}>
                <Text style={s.bannerSub}>Kingdom {k.index}</Text>
                <Text style={s.bannerTitle}>{k.name}</Text>
                <Text style={s.bannerSub}>{k.subtitle}</Text>
                <View style={s.bannerMeta}>
                  <View style={s.bannerChip}>
                    <Icon name="weather-windy" size={14} color="#FFFFFF" />
                    <Text style={s.bannerChipText}>{k.hazard}</Text>
                  </View>
                  <View style={s.bannerChip}>
                    <Icon name="music" size={14} color="#FFFFFF" />
                    <Text style={s.bannerChipText}>{k.music}</Text>
                  </View>
                  {shardRestored ? (
                    <View style={s.bannerChip}>
                      <Icon name="diamond-stone" size={14} color="#FFE7A0" />
                      <Text style={s.bannerChipText}>Sunshard restored</Text>
                    </View>
                  ) : null}
                </View>
              </LinearGradient>
              {unlocked ? (
                <View style={s.stages}>
                  {k.stages.map((id, i) => {
                    const st = getMission(id)!;
                    const ok = stageUnlocked(save, id);
                    const prog = save.progress.stages[id];
                    const boss = st.type === "boss";
                    return (
                      <Pressable
                        key={id}
                        testID={`story-stage-${id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`${st.name}${ok ? "" : ", locked"}`}
                        disabled={!ok}
                        onPress={() => {
                          tap();
                          open(id);
                        }}
                        style={({ pressed }) => [s.node, boss && s.nodeBoss, !ok && s.nodeLocked, pressed && { opacity: 0.8 }]}
                      >
                        <View style={[s.nodeIcon, boss && s.nodeIconBoss]}>
                          <Icon name={ok ? TYPE_ICON[st.type] ?? "sword" : "lock"} size={boss ? 28 : 22} color={ok ? (boss ? colors.brand : colors.onSurface) : colors.muted} />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Caption>
                            {k.index}-{i + 1} · {st.type.toUpperCase()}
                          </Caption>
                          <Heading>{st.name}</Heading>
                        </View>
                        {ok ? <Stars count={prog?.stars ?? 0} testID={`story-stage-${id}-stars`} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View style={s.lockedCard}>
                  <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
                    <Icon name="lock" size={18} color={colors.muted} />
                    <Heading>Sealed</Heading>
                  </View>
                  <Caption>Defeat the previous kingdom's boss to break the seal.</Caption>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={[s.quick, { bottom: space.lg }]} testID="story-quickstart-bar">
        <View style={{ flex: 1 }}>
          <Caption>Next battle</Caption>
          <Heading numberOfLines={1}>{next.name}</Heading>
        </View>
        <Button testID="story-quickstart-button" icon="play" label="Play" onPress={() => open(next.id)} style={{ minHeight: TOUCH }} />
      </View>
    </View>
  );
}
