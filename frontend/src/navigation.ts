import { Platform } from "react-native";

/** iOS 26+ gets native (Liquid Glass) tabs; everything else uses classic JS tabs. */
export const usesNativeTabs = Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;

export const TABS = [
  { name: "story", title: "Story", sf: "map.fill", glyph: "map" },
  { name: "arena", title: "Arena", sf: "target", glyph: "target" },
  { name: "armory", title: "Armory", sf: "hammer.fill", glyph: "hammer" },
  { name: "champions", title: "Champions", sf: "trophy.fill", glyph: "trophy" },
] as const;
