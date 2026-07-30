import type { Component, DefineComponent } from "vue";

declare const Framework7Vue: unknown;

interface AppProps {
  name?: string;
  routes?: unknown[];
  theme?: "auto" | "ios" | "md";
}

interface ViewProps {
  iosSwipeBack?: boolean;
  iosSwipeBackActiveArea?: number;
  iosSwipeBackThreshold?: number;
  main?: boolean;
  preloadPreviousPage?: boolean;
  url?: string;
}

export const f7App: DefineComponent<AppProps>;
export const f7Block: Component;
export const f7BlockTitle: Component;
export const f7Button: Component;
export const f7Link: Component;
export const f7Navbar: Component;
export const f7NavLeft: Component;
export const f7Page: Component;
export const f7View: DefineComponent<ViewProps>;

export default Framework7Vue;
