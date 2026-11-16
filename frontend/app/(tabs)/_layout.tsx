import { Tabs } from "expo-router/tabs";
import { NativeTabs } from "expo-router/native-tabs";
import React from "react";

import { Icon } from "@/src/components/icon";
import { TABS, usesNativeTabs } from "@/src/navigation";
import { fonts, useTheme } from "@/src/theme";

export default function TabsLayout() {
  const { colors } = useTheme();

  if (usesNativeTabs) {
    return (
      <NativeTabs tintColor={colors.brand}>
        {TABS.map((t) => (
          <NativeTabs.Trigger key={t.name} name={t.name}>
            <NativeTabs.Trigger.Label>{t.title}</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf={t.sf} />
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border, minHeight: 60 },
        tabBarLabelStyle: { fontFamily: fonts.bodySemi, fontSize: 12 },
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarButtonTestID: `tab-${t.name}`,
            tabBarIcon: ({ color, size }) => <Icon name={t.glyph} color={String(color)} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
