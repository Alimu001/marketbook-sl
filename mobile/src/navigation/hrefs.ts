import type { Href } from "expo-router";

export const homeHref = "/" as Href;
export const loginHref = "/(auth)/login" as Href;
export const registerHref = "/(auth)/register" as Href;
export const appHref = "/(app)" as Href;

export const loginWithRegisteredHref = {
  pathname: "/(auth)/login",
  params: { registered: "1" },
} as unknown as Href;
