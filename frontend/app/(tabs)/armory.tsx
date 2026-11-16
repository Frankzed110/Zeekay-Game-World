import React, { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/src/components/icon";
import { Body, Button, Caption, Card, Chip, Heading, Label, ProgressBar, Segmented, StatBar, Stars, tap, Title, useToast } from "@/src/components/ui";
import { ELEMENT_COLORS } from "@/src/game/palette";
import {
  ARMORS,
  ATTRS,
  BOWS,
  canAfford,
  CLASS_IDS,
  CLASSES,
  DRILLS,
  ELEMENTS,
  elementUnlocked,
  MASTERY_RANKS,
  masteryRank,
  MATERIALS,
  type ArmorDef,
  type AttrId,
  type BowDef,
  type Cost,
} from "@/src/game/rpg";
import { drillStars, loadoutFromSave, type SaveData } from "@/src/state/progression";
import { useSave } from "@/src/state/save";
import { audio } from "@/src/game/audio";
import { makeStyles, space, useTheme } from "@/src/theme";

type Tab = "stats" | "bows" | "armor" | "craft" | "mastery";

const ELEMENT_ICON: Record<string, string> = { normal: "arrow-up-bold", fire: "fire", ice: "snowflake", storm: "lightning-bolt", toxin: "biohazard" };

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  wallet: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  walletItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  classRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  classCard: { flexGrow: 1, flexBasis: 180, gap: 4 },
  attrRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52 },
  attrBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary },
  item: { gap: space.sm },
  itemHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  rank: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
}));

function costText(cost: Cost) {
  const parts: string[] = [];
  if (cost.gold) parts.push(`${cost.gold}g`);
  for (const [m, n] of Object.entries(cost.materials ?? {})) parts.push(`${n} ${m}`);
  if (cost.level) parts.push(`Lv ${cost.level}`);
  return parts.join(" · ");
}

export default function ArmoryScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { save, update } = useSave();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("stats");
  const lo = loadoutFromSave(save);
  const p = save.profile;

  const spend = (cost: Cost, apply: (d: SaveData) => void, msg: string) => {
    const chk = canAfford(cost, p.gold, save.inventory.materials, p.level);
    if (!chk.ok) {
      toast(chk.reason ?? "Can't afford", "error");
      return;
    }
    update((d) => {
      d.profile.gold -= cost.gold;
      for (const [m, n] of Object.entries(cost.materials ?? {})) d.inventory.materials[m as keyof typeof d.inventory.materials] -= n ?? 0;
      apply(d);
    });
    audio.play("levelup");
    toast(msg, "success");
  };

  const addAttr = (id: AttrId, delta: 1 | -1) =>
    update((d) => {
      if (delta > 0 && d.profile.attrPoints > 0) {
        d.profile.attrs[id] += 1;
        d.profile.attrPoints -= 1;
      } else if (delta < 0 && d.profile.attrs[id] > 0) {
        d.profile.attrs[id] -= 1;
        d.profile.attrPoints += 1;
      }
    });

  const respec = () =>
    update((d) => {
      const total = Object.values(d.profile.attrs).reduce((a, b) => a + b, 0);
      d.profile.attrPoints += total;
      d.profile.attrs = { power: 0, precision: 0, agility: 0, vitality: 0 };
    });

  const renderBow = (b: BowDef) => {
    const owned = save.inventory.bows.includes(b.id);
    const equipped = save.equipped.bow === b.id;
    return (
      <Card key={b.id} style={s.item} testID={`armory-bow-${b.id}`} accent={equipped ? colors.brand : undefined}>
        <View style={s.itemHead}>
          <Icon name="bow-arrow" size={26} color={equipped ? colors.brand : colors.onSurfaceTertiary} />
          <View style={{ flex: 1 }}>
            <Heading>{b.name}</Heading>
            <Caption>{b.special}</Caption>
          </View>
          {equipped ? (
            <Chip label="Equipped" selected testID={`armory-bow-${b.id}-equipped`} />
          ) : owned ? (
            <Button variant="secondary" label="Equip" testID={`armory-bow-${b.id}-equip`} onPress={() => update((d) => void (d.equipped.bow = b.id))} />
          ) : b.source === "shop" ? (
            <Button label={`Buy ${b.cost.gold}g`} testID={`armory-bow-${b.id}-buy`} onPress={() => spend(b.cost, (d) => void d.inventory.bows.push(b.id), `${b.name} acquired`)} />
          ) : (
            <Caption>Craft in the forge</Caption>
          )}
        </View>
        <View style={s.statsRow}>
          <Caption>DMG {b.damage}</Caption>
          <Caption>Draw ×{b.drawSpeed}</Caption>
          <Caption>Range ×{b.range}</Caption>
          <Caption>Crit +{Math.round(b.critBonus * 100)}%</Caption>
          {b.cost.level && !owned ? <Caption>Req. Lv {b.cost.level}</Caption> : null}
        </View>
      </Card>
    );
  };

  const renderArmor = (a: ArmorDef) => {
    const owned = save.inventory.armors.includes(a.id);
    const equipped = save.equipped.armor === a.id;
    return (
      <Card key={a.id} style={s.item} testID={`armory-armor-${a.id}`} accent={equipped ? colors.brand : undefined}>
        <View style={s.itemHead}>
          <Icon name="tshirt-crew" size={26} color={equipped ? colors.brand : colors.onSurfaceTertiary} />
          <View style={{ flex: 1 }}>
            <Heading>{a.name}</Heading>
            <Caption>{a.special}</Caption>
          </View>
          {equipped ? (
            <Chip label="Equipped" selected testID={`armory-armor-${a.id}-equipped`} />
          ) : owned ? (
            <Button variant="secondary" label="Equip" testID={`armory-armor-${a.id}-equip`} onPress={() => update((d) => void (d.equipped.armor = a.id))} />
          ) : a.source === "shop" ? (
            <Button label={`Buy ${a.cost.gold}g`} testID={`armory-armor-${a.id}-buy`} onPress={() => spend(a.cost, (d) => void d.inventory.armors.push(a.id), `${a.name} acquired`)} />
          ) : (
            <Caption>Craft in the forge</Caption>
          )}
        </View>
        <View style={s.statsRow}>
          <Caption>HP +{a.hp}</Caption>
          <Caption>Move ×{a.moveSpeed}</Caption>
          <Caption>Regen {a.regen}/s</Caption>
        </View>
      </Card>
    );
  };

  const recipes = [...BOWS.filter((b) => b.source === "craft").map((b) => ({ kind: "bow" as const, item: b })), ...ARMORS.filter((a) => a.source === "craft").map((a) => ({ kind: "armor" as const, item: a }))];
  const rank = masteryRank(drillStars(save), p.level);

  return (
    <ScrollView style={s.root} testID="armory-screen" contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.lg, gap: space.lg, maxWidth: 900, width: "100%", alignSelf: "center" }}>
      <View style={{ gap: 4 }}>
        <Label>Armory & Forge</Label>
        <Title>{p.name}</Title>
        <View style={s.wallet} testID="armory-wallet">
          <View style={s.walletItem}>
            <Icon name="cash" size={16} color={colors.brandSecondary} />
            <Caption testID="armory-gold">{p.gold} gold</Caption>
          </View>
          {MATERIALS.map((m) => (
            <View key={m.id} style={s.walletItem}>
              <Icon name="hexagon-multiple" size={16} color={m.color} />
              <Caption testID={`armory-material-${m.id}`}>
                {save.inventory.materials[m.id]} {m.name}
              </Caption>
            </View>
          ))}
        </View>
      </View>

      <Segmented<Tab>
        testID="armory-tabs"
        value={tab}
        onChange={setTab}
        options={[
          { value: "stats", label: "Stats" },
          { value: "bows", label: "Bows" },
          { value: "armor", label: "Armor" },
          { value: "craft", label: "Craft" },
          { value: "mastery", label: "Mastery" },
        ]}
      />

      {tab === "stats" ? (
        <>
          <Card style={{ gap: space.md }} testID="armory-class-card">
            <Label>Class</Label>
            <View style={s.classRow}>
              {CLASS_IDS.map((id) => {
                const c = CLASSES[id];
                const sel = p.klass === id;
                return (
                  <Card key={id} testID={`armory-class-${id}`} accent={sel ? colors.brand : colors.border} style={[s.classCard, { backgroundColor: sel ? colors.brandTertiary : colors.surfaceTertiary }]} onPress={() => update((d) => void (d.profile.klass = id))}>
                    <Heading>{c.name}</Heading>
                    <Caption>{c.tagline}</Caption>
                  </Card>
                );
              })}
            </View>
          </Card>

          <Card style={{ gap: space.sm }} testID="armory-attributes-card">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Label>Attributes</Label>
              <Chip label={`${p.attrPoints} points`} selected={p.attrPoints > 0} testID="armory-attr-points" />
            </View>
            {ATTRS.map((a) => (
              <View key={a.id} style={s.attrRow}>
                <View style={{ flex: 1 }}>
                  <Body color={colors.onSurface}>
                    {a.name} · {p.attrs[a.id]}
                  </Body>
                  <Caption>{a.effect}</Caption>
                </View>
                <Pressable testID={`armory-attr-${a.id}-minus`} accessibilityLabel={`Decrease ${a.name}`} style={s.attrBtn} onPress={() => (tap(), addAttr(a.id, -1))}>
                  <Icon name="minus" size={20} color={colors.onSurface} />
                </Pressable>
                <Pressable testID={`armory-attr-${a.id}-plus`} accessibilityLabel={`Increase ${a.name}`} style={[s.attrBtn, p.attrPoints > 0 && { backgroundColor: colors.brand }]} onPress={() => (tap(), addAttr(a.id, 1))}>
                  <Icon name="plus" size={20} color={p.attrPoints > 0 ? colors.onBrand : colors.muted} />
                </Pressable>
              </View>
            ))}
            <Button variant="ghost" icon="refresh" label="Respec (free)" testID="armory-respec-button" onPress={respec} />
          </Card>

          <Card style={{ gap: space.md }} testID="armory-derived-card">
            <Label>Combat stats</Label>
            <StatBar label="Max HP" value={lo.maxHp} max={500} color={colors.success} testID="armory-stat-hp" />
            <StatBar label="Arrow damage" value={lo.damage} max={140} color={colors.brand} testID="armory-stat-damage" />
            <StatBar label="Crit chance" value={lo.critChance * 100} max={60} color={colors.brandSecondary} suffix="%" testID="armory-stat-crit" />
            <StatBar label="Draw speed" value={lo.drawSpeed * (1 + lo.agility * 0.04) * 100} max={250} color={colors.info} suffix="%" testID="armory-stat-draw" />
            <StatBar label="Move speed" value={lo.moveSpeed * 100} max={180} color={colors.warning} suffix="%" testID="armory-stat-move" />
          </Card>
        </>
      ) : null}

      {tab === "bows" ? (
        <>
          <Card style={{ gap: space.sm }} testID="armory-quiver-card">
            <Label>Quiver — elemental arrows</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {ELEMENTS.map((el) => {
                const ok = elementUnlocked(el.id, p.level);
                return (
                  <Chip
                    key={el.id}
                    testID={`armory-element-${el.id}`}
                    label={ok ? el.name : `${el.name} · Lv ${el.level}`}
                    icon={ok ? ELEMENT_ICON[el.id] : "lock"}
                    color={ELEMENT_COLORS[el.id]}
                    selected={save.equipped.element === el.id}
                    disabled={!ok}
                    onPress={() => update((d) => void (d.equipped.element = el.id))}
                  />
                );
              })}
            </ScrollView>
            <Caption>{ELEMENTS.find((e) => e.id === save.equipped.element)?.effect}. Unlimited arrows — skill decides.</Caption>
          </Card>
          {BOWS.map(renderBow)}
        </>
      ) : null}

      {tab === "armor" ? ARMORS.map(renderArmor) : null}

      {tab === "craft" ? (
        <>
          <Caption>Defeat kingdom foes to gather materials, then forge legendary gear.</Caption>
          {recipes.map(({ kind, item }) => {
            const owned = kind === "bow" ? save.inventory.bows.includes(item.id) : save.inventory.armors.includes(item.id);
            const chk = canAfford(item.cost, p.gold, save.inventory.materials, p.level);
            return (
              <Card key={item.id} style={s.item} testID={`armory-recipe-${item.id}`}>
                <View style={s.itemHead}>
                  <Icon name={kind === "bow" ? "bow-arrow" : "tshirt-crew"} size={26} color={owned ? colors.success : colors.brandSecondary} />
                  <View style={{ flex: 1 }}>
                    <Heading>{item.name}</Heading>
                    <Caption>{costText(item.cost)}</Caption>
                  </View>
                  {owned ? (
                    <Chip label="Forged" selected color={colors.success} testID={`armory-recipe-${item.id}-owned`} />
                  ) : (
                    <Button
                      label="Craft"
                      icon="hammer"
                      disabled={!chk.ok}
                      testID={`armory-recipe-${item.id}-craft`}
                      onPress={() =>
                        spend(
                          item.cost,
                          (d) => {
                            if (kind === "bow") d.inventory.bows.push(item.id);
                            else d.inventory.armors.push(item.id);
                            d.inventory.crafted.push(item.id);
                          },
                          `${item.name} forged!`,
                        )
                      }
                    />
                  )}
                </View>
                {!owned && !chk.ok ? <Caption color={colors.warning}>{chk.reason}</Caption> : null}
              </Card>
            );
          })}
        </>
      ) : null}

      {tab === "mastery" ? (
        <>
          <Card style={{ gap: space.sm }} testID="armory-mastery-card">
            <Label>Mastery rank</Label>
            <Title>{MASTERY_RANKS[rank].name}</Title>
            <Caption>
              Each rank adds +2% arrow damage. {drillStars(save)}/9 drill stars · Level {p.level}
            </Caption>
            {MASTERY_RANKS.map((m, i) => (
              <View key={m.name} style={s.rank} testID={`armory-rank-${i}`}>
                <Icon name={i <= rank ? "star-four-points" : "lock"} size={20} color={i <= rank ? colors.brandSecondary : colors.muted} />
                <View style={{ flex: 1 }}>
                  <Body color={i <= rank ? colors.onSurface : colors.muted}>{m.name}</Body>
                  <Caption>
                    {m.stars} drill stars{m.level > 1 ? ` · level ${m.level}` : ""}
                  </Caption>
                </View>
              </View>
            ))}
            {rank < MASTERY_RANKS.length - 1 ? <ProgressBar value={drillStars(save) / Math.max(1, MASTERY_RANKS[rank + 1].stars)} color={colors.brandSecondary} testID="armory-mastery-progress" /> : null}
          </Card>
          <Card style={{ gap: space.sm }} testID="armory-drills-card">
            <Label>Training drills</Label>
            {DRILLS.map((d) => {
              const c = save.mastery.challenges[d.id];
              return (
                <View key={d.id} style={s.rank}>
                  <View style={{ flex: 1 }}>
                    <Body color={colors.onSurface}>{d.name}</Body>
                    <Caption>{c?.best ? `Best ${c.best}` : "Not attempted"}</Caption>
                  </View>
                  <Stars count={c?.stars ?? 0} />
                </View>
              );
            })}
            <Caption>Play drills from the Arena tab → Training Yard.</Caption>
          </Card>
          <Card style={{ gap: space.xs }} testID="armory-career-card">
            <Label>Career</Label>
            <Caption>
              Kills {save.stats.kills} · Headshots {save.stats.headshots} · Accuracy {save.stats.shots ? Math.round((Math.min(save.stats.hits, save.stats.shots) / save.stats.shots) * 100) : 0}% · Hostages saved {save.stats.hostagesSaved} · Arena wins {save.stats.arenasWon} · Best survival wave {save.stats.bestSurvivalWave}
            </Caption>
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}
