import * as SecureStore from 'expo-secure-store';

const KEY = 'gemini_api_key';

export async function getApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY);
}

export async function setApiKey(key: string) {
  await SecureStore.setItemAsync(KEY, key.trim());
}
