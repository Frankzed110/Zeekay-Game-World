import { router } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Switch, TextInput, View } from "react-native";

import { Icon } from "@/src/components/icon";
import { Body, Button, Caption, Card, Heading, IconButton, Label, Title, useScreenPadding, useToast } from "@/src/components/ui";
import { api } from "@/src/api/client";
import { DIFFICULTIES } from "@/src/game/rpg";
import { useSave } from "@/src/state/save";
import { fonts, makeStyles, radius, space, TOUCH, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { gap: space.lg, maxWidth: 720, width: "100%" },
  header: { flexDirection: "row", alignItems: "center", gap: space.md },
  input: { minHeight: TOUCH, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceTertiary, color: c.onSurface, paddingHorizontal: space.md, fontFamily: fonts.bodySemi, fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: TOUCH, gap: space.md },
  diff: { borderRadius: radius.md, borderWidth: 1, padding: space.md, gap: 2 },
  ctrlRow: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
}));

const CONTROLS = [
  { icon: "gesture-tap", title: "Touch", body: "Drag on the battlefield to aim and draw; release to loose. Hold the ◀ ▶ pads to move. Tap abilities and element chips." },
  { icon: "keyboard", title: "Keyboard & mouse", body: "Hold Space or the mouse to draw · mouse / W-S / ↑↓ to aim · A/D move · 1–4 abilities · Q element · Esc pause." },
  { icon: "gamepad-variant", title: "Controller", body: "The input layer is controller-ready (draw, aim, move, abilities, element, pause). Gamepad mapping arrives in a future update." },
];

export default function SettingsScreen() {
  const s = useStyles();
  const pad = useScreenPadding();
  const { colors } = useTheme();
  const toast = useToast();
  const { save, update, syncStatus, lastSynced, syncNow, playerKey } = useSave();
  const [name, setName] = useState(save.profile.name);

  const commitName = () => {
    const clean = name.trim().replace(/\s+/g, " ").slice(0, 24);
    if (!clean) {
      setName(save.profile.name);
      return;
    }
    if (clean !== save.profile.name) {
      update((d) => {
        d.profile.name = clean;
      });
      toast("Name saved", "success");
    }
  };

  const syncLabel = { local: "Local only (no backend configured)", syncing: "Syncing…", synced: "Synced to cloud", offline: "Offline — will retry" }[syncStatus];
  const syncIcon = { local: "cloud-off-outline", syncing: "cloud-sync", synced: "cloud-check", offline: "wifi-off" }[syncStatus];

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, { paddingTop: pad.top, paddingBottom: pad.bottom, paddingLeft: pad.left, paddingRight: pad.right }]}>
        <View style={s.header}>
          <IconButton icon="arrow-left" label="Back" testID="settings-back-button" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
          <Title>Settings</Title>
        </View>

        <Card testID="settings-profile-card" style={{ gap: space.md }}>
          <Label>Archer name</Label>
          <TextInput
            testID="settings-name-input"
            value={name}
            onChangeText={setName}
            onBlur={commitName}
            onSubmitEditing={commitName}
            maxLength={24}
            placeholder="Your name"
            placeholderTextColor={colors.muted}
            style={s.input}
            returnKeyType="done"
            autoCorrect={false}
          />
          <Caption>Shown on leaderboards and the Hall of Champions.</Caption>
        </Card>

        <Card testID="settings-difficulty-card" style={{ gap: space.md }}>
          <Label>Difficulty</Label>
          {DIFFICULTIES.map((d) => {
            const sel = save.progress.difficulty === d.id;
            return (
              <Card
                key={d.id}
                testID={`settings-difficulty-${d.id}`}
                accent={sel ? colors.brand : colors.border}
                style={[s.diff, { backgroundColor: sel ? colors.brandTertiary : colors.surfaceTertiary }]}
                onPress={() =>
                  update((x) => {
                    x.progress.difficulty = d.id;
                  })
                }
              >
                <View style={s.row}>
                  <Heading>{d.name}</Heading>
                  <Caption>×{d.mult} foes & rewards</Caption>
                </View>
                <Caption>{d.desc}</Caption>
              </Card>
            );
          })}
        </Card>

        <Card testID="settings-audio-card" style={{ gap: space.xs }}>
          <Label>Audio</Label>
          <View style={s.row}>
            <Body color={colors.onSurface}>Music</Body>
            <Switch
              testID="settings-music-toggle"
              value={save.settings.music}
              onValueChange={(v) =>
                update((x) => {
                  x.settings.music = v;
                })
              }
              trackColor={{ true: colors.brand, false: colors.surfaceTertiary }}
            />
          </View>
          <View style={s.row}>
            <Body color={colors.onSurface}>Sound effects</Body>
            <Switch
              testID="settings-sfx-toggle"
              value={save.settings.sfx}
              onValueChange={(v) =>
                update((x) => {
                  x.settings.sfx = v;
                })
              }
              trackColor={{ true: colors.brand, false: colors.surfaceTertiary }}
            />
          </View>
        </Card>

        <Card testID="settings-cloud-card" style={{ gap: space.md }}>
          <Label>Cloud save</Label>
          <View style={[s.row, { justifyContent: "flex-start" }]}>
            <Icon name={syncIcon} size={22} color={syncStatus === "synced" ? colors.success : colors.muted} />
            <View style={{ flex: 1 }}>
              <Body color={colors.onSurface} testID="settings-sync-status">
                {syncLabel}
              </Body>
              {lastSynced ? <Caption>Last sync {new Date(lastSynced).toLocaleString()}</Caption> : null}
            </View>
          </View>
          <Caption>Progress saves on this device instantly and syncs automatically — no account needed. Player ID: {playerKey ? `…${playerKey.slice(-6)}` : "—"}</Caption>
          <Button variant="secondary" icon="sync" label="Sync now" testID="settings-sync-button" disabled={!api.hasBackend()} loading={syncStatus === "syncing"} onPress={syncNow} />
        </Card>

        <Card testID="settings-controls-card" style={{ gap: space.md }}>
          <Label>Controls</Label>
          {CONTROLS.map((c) => (
            <View key={c.title} style={s.ctrlRow}>
              <Icon name={c.icon} size={22} color={colors.brandSecondary} />
              <View style={{ flex: 1 }}>
                <Body color={colors.onSurface}>{c.title}</Body>
                <Caption>{c.body}</Caption>
              </View>
            </View>
          ))}
        </Card>

        <Card testID="settings-credits-card" style={{ gap: space.xs }}>
          <Label>Credits</Label>
          <Caption>Zeekay Game World — an original tale of Ardenfall. Music and sound synthesized in-house. Fonts: Outfit & Plus Jakarta Sans (SIL Open Font License). Icons: Material Design Icons.</Caption>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
