import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { Icon } from "@/src/components/icon";
import { Body, Button, Caption, Card, Heading, Label, Stars, Title } from "@/src/components/ui";
import { ARENA_MODES, drillStage, TOURNAMENT_ROUNDS } from "@/src/game/missions";
import { DRILLS, MASTERY_RANKS, masteryRank } from "@/src/game/rpg";
import { drillStars } from "@/src/state/progression";
import { useSave } from "@/src/state/save";
import { makeStyles, radius, space, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  card: { flexGrow: 1, flexBasis: 300, gap: space.md },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  modeIcon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  topRow: { flexDirection: "row", justifyContent: "space-between", gap: space.sm },
  bracket: { flexDirection: "row", gap: space.sm },
  round: { flex: 1, padding: space.sm, borderRadius: radius.md, borderWidth: 1, gap: 2 },
  drill: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
}));

export default function ArenaScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { save } = useSave();
  const champs = useQuery({ queryKey: ["champions"], queryFn: api.champions, enabled: api.hasBackend() });
  const rank = masteryRank(drillStars(save), save.profile.level);
  const round = save.progress.tournament.round;

  const go = (stageId: string) => router.push({ pathname: "/mission/[stageId]", params: { stageId } });

  return (
    <ScrollView style={s.root} testID="arena-screen" contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.lg, gap: space.lg, maxWidth: 1000, width: "100%", alignSelf: "center" }}>
      <View style={{ gap: 4 }}>
        <Label>Arena of Ardenfall</Label>
        <Title>Prove your aim</Title>
        <Body>Every arena run is scored and posted to the Hall of Champions.</Body>
      </View>

      <View style={s.grid}>
        {ARENA_MODES.map((m) => {
          const best = save.progress.arenaBest[m.mode] ?? 0;
          const top = champs.data?.by_mode[m.mode]?.slice(0, 3) ?? [];
          const stageId = m.mode === "arena_tournament" ? `arena_tournament-${round + 1}` : m.stageId;
          return (
            <Card key={m.mode} style={s.card} testID={`arena-mode-${m.mode}`}>
              <View style={s.cardHead}>
                <View style={s.modeIcon}>
                  <Icon name={m.glyph} size={26} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Heading>{m.name}</Heading>
                  <Caption>{m.desc}</Caption>
                </View>
              </View>

              {m.mode === "arena_tournament" ? (
                <View style={s.bracket} testID="arena-tournament-bracket">
                  {TOURNAMENT_ROUNDS.map((r, i) => (
                    <View key={r.round} style={[s.round, { borderColor: i === round ? colors.brand : colors.border, backgroundColor: i < round ? colors.brandTertiary : "transparent" }]}>
                      <Caption>{r.round}</Caption>
                      <Body color={colors.onSurface} numberOfLines={1}>
                        {i < round ? "✓ " : ""}
                        {r.champion}
                      </Body>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={s.topRow}>
                <View>
                  <Caption>Personal best</Caption>
                  <Heading testID={`arena-best-${m.mode}`}>{best ? best.toLocaleString() : "—"}</Heading>
                </View>
                <View style={{ alignItems: "flex-end", flex: 1 }}>
                  <Caption>Global top 3</Caption>
                  {champs.isLoading ? (
                    <Caption>Loading…</Caption>
                  ) : champs.isError || !api.hasBackend() ? (
                    <Caption>Offline</Caption>
                  ) : top.length === 0 ? (
                    <Caption>Be the first!</Caption>
                  ) : (
                    top.map((e) => (
                      <Caption key={e.player_key} numberOfLines={1}>
                        #{e.rank} {e.display_name} · {e.score.toLocaleString()}
                      </Caption>
                    ))
                  )}
                </View>
              </View>
              <Button testID={`arena-play-${m.mode}`} icon="play" label={m.mode === "arena_tournament" && round > 0 ? `Continue — ${TOURNAMENT_ROUNDS[round].round}` : "Enter"} onPress={() => go(stageId)} />
            </Card>
          );
        })}
      </View>

      <Card testID="arena-training-card" style={{ gap: space.sm }}>
        <View style={s.cardHead}>
          <View style={s.modeIcon}>
            <Icon name="school" size={26} color={colors.brandSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Heading>Training Yard</Heading>
            <Caption>
              Mastery rank: {MASTERY_RANKS[rank].name} · {drillStars(save)}/9 drill stars
            </Caption>
          </View>
        </View>
        {DRILLS.map((d) => {
          const c = save.mastery.challenges[d.id];
          return (
            <View key={d.id} style={s.drill}>
              <View style={{ flex: 1 }}>
                <Body color={colors.onSurface}>{d.name}</Body>
                <Caption>
                  {d.desc}
                  {c?.best ? ` · best ${c.best}` : ""}
                </Caption>
              </View>
              <Stars count={c?.stars ?? 0} testID={`arena-drill-${d.id}-stars`} />
              <Button variant="secondary" label="Train" testID={`arena-drill-${d.id}`} onPress={() => go(drillStage(d.id))} />
            </View>
          );
        })}
      </Card>
    </ScrollView>
  );
}
