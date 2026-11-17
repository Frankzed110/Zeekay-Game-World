// App entry. On web, Skia needs CanvasKit (wasm) loaded before any Skia module evaluates,
// so we defer expo-router's entry until it is ready. Native platforms start immediately.
import { Platform } from "react-native";

if (Platform.OS === "web") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { LoadSkiaWeb } = require("@shopify/react-native-skia/lib/module/web");
  LoadSkiaWeb({ locateFile: (file: string) => `${process.env.EXPO_PUBLIC_BASE_URL ?? ""}/${file}` })
    .catch((e: unknown) => console.error("CanvasKit failed to load", e))
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    .then(() => require("expo-router/entry"));
} else {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("expo-router/entry");
}
