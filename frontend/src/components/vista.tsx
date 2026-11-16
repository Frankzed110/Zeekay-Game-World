"use no memo";
// Animated Skia backdrop (title screen + banners), ~30 fps.
import type { SkPicture } from "@shopify/react-native-skia";
import React, { useEffect, useRef, useState } from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";

import { renderVista, SkiaPictureView } from "@/src/game/render";
import type { BiomeId } from "@/src/game/types";

export function Vista({ biome, style, testID, animate = true }: { biome: BiomeId; style?: StyleProp<ViewStyle>; testID?: string; animate?: boolean }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pic, setPic] = useState<SkPicture | null>(null);
  const start = useRef(0);

  useEffect(() => {
    if (!size.w || !size.h) return;
    if (!start.current) start.current = Date.now();
    let raf = 0;
    let last = 0;
    const loop = (ts: number) => {
      if (ts - last > 33) {
        last = ts;
        setPic(renderVista(biome, size.w, size.h, (Date.now() - start.current) / 1000 + 20));
      }
      if (animate) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [biome, size.w, size.h, animate]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1) setSize({ w: Math.round(width), h: Math.round(height) });
  };

  return (
    <View style={style} onLayout={onLayout} testID={testID} pointerEvents="none">
      {size.w > 0 ? <SkiaPictureView picture={pic} style={{ width: size.w, height: size.h }} /> : null}
    </View>
  );
}
