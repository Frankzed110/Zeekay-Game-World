// Runtime-loaded Material Design Icons (font loaded via expo-font in the root layout).
import React from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";

import glyphMap from "@react-native-vector-icons/material-design-icons/glyphmaps/MaterialDesignIcons.json";

export const ICON_FONT = "MaterialDesignIcons";
export const iconFontSource = require("@react-native-vector-icons/material-design-icons/fonts/MaterialDesignIcons.ttf");

export type IconName = keyof typeof glyphMap;

export function Icon({ name, size = 20, color, style, testID }: { name: IconName | string; size?: number; color: string; style?: StyleProp<TextStyle>; testID?: string }) {
  const code = (glyphMap as Record<string, number>)[name] ?? (glyphMap as Record<string, number>)["help-circle-outline"];
  return (
    <Text
      testID={testID}
      accessible={false}
      allowFontScaling={false}
      style={[{ fontFamily: ICON_FONT, fontSize: size, color, lineHeight: size * 1.1, includeFontPadding: false }, style]}
    >
      {String.fromCodePoint(code)}
    </Text>
  );
}
