import React from "react";
import { Pressable, Text, View } from "react-native";

import { themes } from "@/src/theme";

interface State {
  error: Error | null;
}

/** Top-level crash guard: shows a recoverable message instead of a blank screen. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[ErrorBoundary]", error);
  }

  render() {
    const c = themes.light;
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: c.surface, alignItems: "flex-start", justifyContent: "center", padding: 24, gap: 12 }}>
        <Text style={{ color: c.onSurface, fontSize: 22, fontWeight: "700" }}>The realm stumbled.</Text>
        <Text style={{ color: c.muted, fontSize: 14 }}>{this.state.error.message}</Text>
        <Pressable
          testID="error-retry-button"
          onPress={() => this.setState({ error: null })}
          style={{ backgroundColor: c.brand, paddingHorizontal: 20, minHeight: 44, justifyContent: "center", borderRadius: 12 }}
        >
          <Text style={{ color: c.onBrand, fontWeight: "700" }}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}
