// UI kit: typography, Button, Chip, Card, ProgressBar, StatBar, Segmented, Stars, Toast, Sheet.
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { audio } from "@/src/game/audio";
import { fonts, makeStyles, radius, space, TOUCH, useTheme } from "@/src/theme";

import { Icon } from "./icon";

// ---------------------------------------------------------------------------
// Typography

type TextProps = { children: React.ReactNode; style?: StyleProp<TextStyle>; testID?: string; numberOfLines?: number; color?: string };

const useTextStyles = makeStyles((c) => ({
  display: { fontFamily: fonts.displayHeavy, fontSize: 34, lineHeight: 38, color: c.onSurface, letterSpacing: 0.5 },
  title: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: c.onSurface },
  heading: { fontFamily: fonts.displaySemi, fontSize: 17, lineHeight: 22, color: c.onSurface },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: c.onSurfaceSecondary },
  label: { fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16, color: c.muted, letterSpacing: 1.2, textTransform: "uppercase" },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: c.muted },
}));

function makeText(kind: "display" | "title" | "heading" | "body" | "label" | "caption") {
  return function T({ children, style, testID, numberOfLines, color }: TextProps) {
    const s = useTextStyles();
    return (
      <Text testID={testID} numberOfLines={numberOfLines} style={[s[kind], color ? { color } : null, style]}>
        {children}
      </Text>
    );
  };
}
export const Display = makeText("display");
export const Title = makeText("title");
export const Heading = makeText("heading");
export const Body = makeText("body");
export const Label = makeText("label");
export const Caption = makeText("caption");

// ---------------------------------------------------------------------------
// Feedback helpers

export function tap() {
  audio.unlock();
  audio.play("ui");
  if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
}

// ---------------------------------------------------------------------------
// Button

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const useButtonStyles = makeStyles((c) => ({
  base: { minHeight: TOUCH, paddingHorizontal: space.lg, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
  primary: { backgroundColor: c.brand },
  secondary: { backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border },
  ghost: { backgroundColor: "transparent" },
  danger: { backgroundColor: c.error },
  large: { minHeight: 56, paddingHorizontal: space.xl, borderRadius: radius.lg },
  text: { fontFamily: fonts.display, fontSize: 16, letterSpacing: 0.3 },
  largeText: { fontSize: 18 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
}));

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  testID,
  disabled,
  large,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: string;
  testID: string;
  disabled?: boolean;
  large?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const s = useButtonStyles();
  const { colors } = useTheme();
  const fg = variant === "primary" || variant === "danger" ? colors.onBrand : variant === "ghost" ? colors.brand : colors.onSurface;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled || loading}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [s.base, s[variant], large && s.large, disabled && s.disabled, pressed && s.pressed, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={large ? 22 : 18} color={fg} /> : null}
      <Text style={[s.text, large && s.largeText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, testID, label, size = 22, tone }: { icon: string; onPress: () => void; testID: string; label: string; size?: number; tone?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => ({ width: TOUCH, height: TOUCH, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.75 : 1 })}
    >
      <Icon name={icon} size={size} color={tone ?? colors.onSurface} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Chip

export function Chip({ label, selected, onPress, testID, icon, color, disabled }: { label: string; selected?: boolean; onPress?: () => void; testID: string; icon?: string; color?: string; disabled?: boolean }) {
  const { colors } = useTheme();
  const accent = color ?? colors.brand;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled || !onPress}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => ({
        flexShrink: 0,
        minHeight: 36,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: selected ? accent : colors.surfaceTertiary,
        borderWidth: 1,
        borderColor: selected ? accent : colors.border,
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      {icon ? <Icon name={icon} size={16} color={selected ? colors.onBrand : accent} /> : null}
      <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: selected ? colors.onBrand : colors.onSurfaceSecondary }}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Card

export function Card({ children, style, testID, onPress, accent }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string; onPress?: () => void; accent?: string }) {
  const { colors } = useTheme();
  const base: ViewStyle = { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: accent ?? colors.border };
  if (!onPress)
    return (
      <View testID={testID} style={[base, style]}>
        {children}
      </View>
    );
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [base, pressed && { opacity: 0.85 }, style]}
    >
      {children}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Progress / stats

export function ProgressBar({ value, color, height = 8, testID, track }: { value: number; color?: string; height?: number; testID?: string; track?: string }) {
  const { colors } = useTheme();
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <View testID={testID} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }} style={{ height, borderRadius: height, backgroundColor: track ?? colors.surfaceTertiary, overflow: "hidden" }}>
      <View style={{ width: `${v * 100}%`, height: "100%", borderRadius: height, backgroundColor: color ?? colors.brand }} />
    </View>
  );
}

export function StatBar({ label, value, max, color, testID, suffix }: { label: string; value: number; max: number; color?: string; testID: string; suffix?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.onSurfaceSecondary }}>{label}</Text>
        <Text style={{ fontFamily: fonts.display, fontSize: 13, color: colors.onSurface }}>
          {Math.round(value)}
          {suffix ?? ""}
        </Text>
      </View>
      <ProgressBar value={value / max} color={color} height={6} />
    </View>
  );
}

export function Stars({ count, max = 3, size = 16, testID }: { count: number; max?: number; size?: number; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: "row", gap: 2 }} accessibilityLabel={`${count} of ${max} stars`}>
      {Array.from({ length: max }).map((_, i) => (
        <Icon key={i} name={i < count ? "star" : "star-outline"} size={size} color={i < count ? colors.brandSecondary : colors.muted} />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Segmented control

export function Segmented<T extends string>({ options, value, onChange, testID }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} testID={testID} contentContainerStyle={{ gap: space.xs, padding: space.xs, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill }}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={`${testID}-${o.value}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={{ flexShrink: 0, minHeight: 40, paddingHorizontal: space.lg, borderRadius: radius.pill, justifyContent: "center", backgroundColor: sel ? colors.brand : "transparent" }}
          >
            <Text style={{ fontFamily: fonts.displaySemi, fontSize: 14, color: sel ? colors.onBrand : colors.onSurfaceTertiary }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// States

export function EmptyState({ icon, title, body, action, testID }: { icon: string; title: string; body: string; action?: React.ReactNode; testID: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{ alignItems: "flex-start", gap: space.sm, paddingVertical: space.xl }}>
      <Icon name={icon} size={36} color={colors.muted} />
      <Heading>{title}</Heading>
      <Caption>{body}</Caption>
      {action}
    </View>
  );
}

export function LoadingRows({ rows = 4, testID }: { rows?: number; testID: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{ gap: space.sm }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, opacity: 1 - i * 0.15 }} />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Toast (mounted high in the tree, above tab bars)

type ToastTone = "info" | "success" | "error";
interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}
const ToastCtx = createContext<(text: string, tone?: ToastTone) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(1);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const show = useCallback((text: string, tone: ToastTone = "info") => {
    const id = idRef.current++;
    setItems((x) => [...x.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <View pointerEvents="none" style={{ position: "absolute", left: space.lg, right: space.lg, top: insets.top + space.sm, gap: space.sm, alignItems: "flex-start" }}>
        {items.map((t) => (
          <View
            key={t.id}
            testID="toast"
            style={{
              backgroundColor: colors.surfaceTertiary,
              borderLeftWidth: 4,
              borderLeftColor: t.tone === "success" ? colors.success : t.tone === "error" ? colors.error : colors.info,
              paddingHorizontal: space.lg,
              paddingVertical: space.md,
              borderRadius: radius.md,
              maxWidth: 520,
            }}
          >
            <Text style={{ fontFamily: fonts.bodySemi, color: colors.onSurface, fontSize: 14 }}>{t.text}</Text>
          </View>
        ))}
      </View>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ---------------------------------------------------------------------------
// Sheet / modal with glass backdrop

export function Sheet({ visible, onClose, children, testID, dismissable = true }: { visible: boolean; onClose: () => void; children: React.ReactNode; testID: string; dismissable?: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismissable ? onClose : () => {}} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: space.lg, paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg }}>
        <BlurView intensity={40} tint="dark" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
        <Pressable testID={`${testID}-backdrop`} accessibilityLabel="Close" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" }} onPress={dismissable ? onClose : undefined} />
        <View testID={testID} style={{ width: "100%", maxWidth: 560, maxHeight: "100%", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
          <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.md }}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function useScreenPadding() {
  const insets = useSafeAreaInsets();
  return useMemo(() => ({ top: insets.top + space.lg, bottom: insets.bottom + space.lg, left: Math.max(insets.left, space.lg), right: Math.max(insets.right, space.lg) }), [insets]);
}
