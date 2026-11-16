import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

import { Icon } from "@/src/components/icon";
import { Body, Button, Caption, Display, Heading, IconButton, Label, Sheet, useScreenPadding } from "@/src/components/ui";
import { Vista } from "@/src/components/vista";
import { audio } from "@/src/game/audio";
import { STORY } from "@/src/game/missions";
import { hasProgress, nextStoryStage, totalStars } from "@/src/state/progression";
import { useSave } from "@/src/state/save";
import { fonts, makeStyles, radius, space, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  bg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  scroll: { flexGrow: 1, justifyContent: "space-between", gap: space.xl },
  top: { flexDirection: "row", justifyContent: "flex-end", gap: space.sm },
  hero: { gap: space.sm, maxWidth: 560 },
  kicker: { color: c.brandSecondary },
  logo: { fontFamily: fonts.displayHeavy, fontSize: 52, lineHeight: 54, color: c.onSurface, letterSpacing: 1 },
  logoAccent: { color: c.brand },
  actions: { gap: space.md, maxWidth: 420, width: "100%" },
  row: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  rowBtn: { flexGrow: 1, flexBasis: 110 },
  meta: { flexDirection: "row", alignItems: "center", gap: space.sm },
  howRow: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  howIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
}));

const HOW = [
  { icon: "gesture-swipe", title: "Drag to aim", body: "Drag anywhere on the battlefield — pull down-left to aim up-right, like a slingshot." },
  { icon: "timer-outline", title: "Hold to draw", body: "The longer you hold, the stronger the shot. Hold too long and your aim shakes." },
  { icon: "weather-windy", title: "Read the wind", body: "Wind bends every arrow. The dotted arc shows where your shot will fly." },
  { icon: "target-account", title: "Aim high", body: "Headshots (top of the body) deal double damage and break shields." },
  { icon: "keyboard", title: "Keyboard", body: "Space draw · W/S or ↑/↓ angle · A/D move · 1–4 abilities · Q element · Esc pause." },
];

export default function TitleScreen() {
  const s = useStyles();
  const pad = useScreenPadding();
  const { colors } = useTheme();
  const { save, ready } = useSave();
  const [how, setHow] = useState(false);
  const started = ready && hasProgress(save);

  useEffect(() => {
    audio.playMusic("title");
  }, []);

  return (
    <View style={s.root} testID="title-screen">
      <Vista biome="vale" style={s.bg} testID="title-vista" />
      <ScrollView contentContainerStyle={[s.scroll, { paddingTop: pad.top, paddingBottom: pad.bottom, paddingLeft: pad.left, paddingRight: pad.right }]}>
        <View style={s.top}>
          <IconButton icon="help-circle-outline" label="How to play" testID="title-howto-button" onPress={() => setHow(true)} />
          <IconButton icon="cog" label="Settings" testID="title-settings-button" onPress={() => router.push("/settings")} />
        </View>

        <View style={s.hero}>
          <Label style={s.kicker}>{STORY.title}</Label>
          <Display style={s.logo} testID="title-logo">
            ZEEKAY{"\n"}
            <Display style={[s.logo, s.logoAccent]}>GAME WORLD</Display>
          </Display>
          <Body>{STORY.text}</Body>
          {started ? (
            <View style={s.meta} testID="title-progress">
              <Icon name="star" size={16} color={colors.brandSecondary} />
              <Caption>
                {save.profile.name} · Level {save.profile.level} · {totalStars(save)} stars
              </Caption>
            </View>
          ) : null}
        </View>

        <View style={s.actions}>
          <Button
            large
            testID="title-continue-button"
            icon="bow-arrow"
            label={started ? "Continue Campaign" : "Start Journey"}
            onPress={() => {
              router.replace("/(tabs)/story");
              if (!started) router.push({ pathname: "/mission/[stageId]", params: { stageId: nextStoryStage(save) } });
            }}
          />
          <View style={s.row}>
            <Button style={s.rowBtn} variant="secondary" icon="target" label="Arena" testID="title-arena-button" onPress={() => router.replace("/(tabs)/arena")} />
            <Button style={s.rowBtn} variant="secondary" icon="hammer" label="Armory" testID="title-armory-button" onPress={() => router.replace("/(tabs)/armory")} />
            <Button style={s.rowBtn} variant="secondary" icon="trophy" label="Champions" testID="title-champions-button" onPress={() => router.replace("/(tabs)/champions")} />
          </View>
        </View>
      </ScrollView>

      <Sheet visible={how} onClose={() => setHow(false)} testID="howto-modal">
        <Heading>How to play</Heading>
        {HOW.map((h) => (
          <View key={h.title} style={s.howRow}>
            <View style={s.howIcon}>
              <Icon name={h.icon} size={20} color={colors.onBrandTertiary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Body color={colors.onSurface}>{h.title}</Body>
              <Caption>{h.body}</Caption>
            </View>
          </View>
        ))}
        <Button label="Got it" testID="howto-close-button" onPress={() => setHow(false)} />
      </Sheet>
    </View>
  );
}
