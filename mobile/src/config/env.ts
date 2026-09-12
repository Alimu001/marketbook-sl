export const env = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "",
  appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? "development",
} as const;
