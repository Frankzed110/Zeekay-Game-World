// JSON storage helpers. `storage` = AsyncStorage (localStorage on web);
// `secureStorage` = SecureStore on native, AsyncStorage fallback on web.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export interface JsonStorage {
  getItem<T>(key: string, fallback: T): Promise<T>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
}

function parse<T>(raw: string | null, fallback: T): T {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const storage: JsonStorage = {
  async getItem(key, fallback) {
    try {
      return parse(await AsyncStorage.getItem(key), fallback);
    } catch {
      return fallback;
    }
  },
  async setItem(key, value) {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage full / unavailable — ignore, cloud sync is the backup
    }
  },
  async removeItem(key) {
    try {
      await AsyncStorage.removeItem(key);
    } catch {}
  },
};

const secureAvailable = Platform.OS === "ios" || Platform.OS === "android";

export const secureStorage: JsonStorage = secureAvailable
  ? {
      async getItem(key, fallback) {
        try {
          return parse(await SecureStore.getItemAsync(key), fallback);
        } catch {
          return fallback;
        }
      },
      async setItem(key, value) {
        try {
          await SecureStore.setItemAsync(key, JSON.stringify(value));
        } catch {}
      },
      async removeItem(key) {
        try {
          await SecureStore.deleteItemAsync(key);
        } catch {}
      },
    }
  : storage;
