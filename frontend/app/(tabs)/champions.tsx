import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, type LeaderEntry } from "@/src/api/client";
import { Icon } from "@/src/components/icon";
import { Body, Button, Caption, Card, EmptyState, Heading, Label, LoadingRows, Segmented, Title } from "@/src/components/ui";
import { MODE_LABEL } from "@/src/game/missions";
import type { ScoreMode } from "@/src/game/types";
import { useSave } from "@/src/state/save";
import { fonts, makeStyles, radius, space, useTheme } from "@/src/theme";

type Tab = "hall" | ScoreMode;

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  podium: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  step: { flex: 1, alignItems: "center", gap: space.xs },
  block: { width: "100%", borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, alignItems: "center", justifyContent: "flex-start", paddingTop: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: c.divider },
  rank: { width: 36, fontFamily: fonts.displayHeavy, fontSize: 18, color: c.muted },
  me: { backgroundColor: c.brandTertiary, borderRadius: radius.md, paddingHorizontal: space.sm },
  banner: { flexDirection: "row", alignItems: "center", gap: space.md },
}));

const PODIUM_COLORS = ["#E3B341", "#C9CED9", "#C98A4A"];

export default function ChampionsScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { playerKey, save } = useSave();
  const [tab, setTab] = useState<Tab>("hall");
  const q = useQuery({ queryKey: ["champions"], queryFn: api.champions, enabled: api.hasBackend() });

  const list: LeaderEntry[] = q.data ? (tab === "hall" ? q.data.hall : q.data.by_mode[tab] ?? []) : [];
  const mine = list.find((e) => e.player_key === playerKey);
  const podium = q.data?.hall.slice(0, 3) ?? [];
  const order = [1, 0, 2]; // 2nd, 1st, 3rd

  return (
    <ScrollView
      style={s.root}
      testID="champions-screen"
      refreshControl={<RefreshControl refreshing={q.isFetching && !q.isLoading} onRefresh={() => void q.refetch()} tintColor={colors.brand} />}
      contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.lg, gap: space.lg, maxWidth: 800, width: "100%", alignSelf: "center" }}
    >
      <View style={{ gap: 4 }}>
        <Label>Hall of Champions</Label>
        <Title>Legends of the Arena</Title>
        <Body>Hall ranking sums each archer’s best score across all four arena modes.</Body>
      </View>

      {!api.hasBackend() ? (
        <EmptyState testID="champions-offline" icon="cloud-off-outline" title="Leaderboards offline" body="No backend is configured (EXPO_PUBLIC_BACKEND_URL). Your scores are still saved on this device." />
      ) : q.isLoading ? (
        <LoadingRows testID="champions-loading" rows={5} />
      ) : q.isError ? (
        <EmptyState testID="champions-error" icon="alert-circle-outline" title="Couldn’t reach the Hall" body="Check your connection and try again." action={<Button variant="secondary" label="Retry" icon="refresh" testID="champions-retry-button" onPress={() => q.refetch()} />} />
      ) : (
        <>
          {podium.length > 0 ? (
            <Card testID="champions-podium" style={{ gap: space.md }}>
              <View style={s.podium}>
                {order.map((i) => {
                  const e = podium[i];
                  if (!e) return <View key={i} style={s.step} />;
                  return (
                    <View key={i} style={s.step} testID={`champions-podium-${i + 1}`}>
                      <Icon name={i === 0 ? "crown" : "medal"} size={i === 0 ? 30 : 24} color={PODIUM_COLORS[i]} />
                      <Heading numberOfLines={1}>{e.display_name}</Heading>
                      <Caption>{e.score.toLocaleString()}</Caption>
                      <View style={[s.block, { height: [96, 70, 54][i], backgroundColor: PODIUM_COLORS[i] }]}>
                        <Heading color={colors.onSurfaceInverse}>{i + 1}</Heading>
                      </View>
                    </View>
                  );
                })}
              </View>
            </Card>
          ) : null}

          <Segmented<Tab>
            testID="champions-tabs"
            value={tab}
            onChange={setTab}
            options={[{ value: "hall", label: "Hall" }, ...(Object.keys(MODE_LABEL) as ScoreMode[]).map((m) => ({ value: m as Tab, label: MODE_LABEL[m] }))]}
          />

          <Card testID="champions-my-rank" style={s.banner}>
            <Icon name="account" size={22} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Caption>{save.profile.name}</Caption>
              <Heading>{mine ? `Rank #${mine.rank} · ${mine.score.toLocaleString()}` : "Not ranked yet — enter the arena!"}</Heading>
            </View>
          </Card>

          {list.length === 0 ? (
            <EmptyState testID="champions-empty" icon="trophy-variant" title="No champions yet" body="Scores appear here after arena runs. Claim the first spot." />
          ) : (
            <View testID="champions-list">
              {list.map((e) => (
                <View key={e.player_key} style={[s.row, e.player_key === playerKey && s.me]} testID={`champions-row-${e.rank}`}>
                  <Body style={s.rank}>#{e.rank}</Body>
                  <View style={{ flex: 1 }}>
                    <Heading numberOfLines={1}>{e.display_name}</Heading>
                    {"modes" in e && Array.isArray((e as { modes?: string[] }).modes) ? (
                      <Caption>{((e as { modes: ScoreMode[] }).modes).map((m) => MODE_LABEL[m]).join(" · ")}</Caption>
                    ) : e.difficulty ? (
                      <Caption>{e.difficulty}</Caption>
                    ) : null}
                  </View>
                  <Heading>{e.score.toLocaleString()}</Heading>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}
