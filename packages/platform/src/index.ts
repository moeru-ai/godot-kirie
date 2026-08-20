import type { KirieEventaContext } from "@gd-kirie/ipc-eventa";
import { defineInvokeEventa, defineInvokes } from "@moeru/eventa";

export type ResizeEdge =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface HostWindowPointerPosition {
  x: number;
  y: number;
  inside: boolean;
}

export interface HostWindowClient {
  getPointerPosition: () => Promise<HostWindowPointerPosition>;
  setPointerPassthrough: (enabled: boolean) => Promise<void>;
  beginMove: () => Promise<void>;
  beginResize: (edge: ResizeEdge) => Promise<void>;
  setAlwaysOnTop: (enabled: boolean) => Promise<void>;
  centerOnCurrentDisplay: () => Promise<void>;
}

export interface PlatformClient {
  hostWindow: HostWindowClient;
}

type EmptyPayload = Record<string, never>;

const events = {
  beginMove: defineInvokeEventa<EmptyPayload, EmptyPayload>(
    "kirie:platform:host-window:begin-move",
  ),
  beginResize: defineInvokeEventa<EmptyPayload, ResizeEdge>(
    "kirie:platform:host-window:begin-resize",
  ),
  center: defineInvokeEventa<EmptyPayload, EmptyPayload>("kirie:platform:host-window:center"),
  getPointerPosition: defineInvokeEventa<HostWindowPointerPosition, EmptyPayload>(
    "kirie:platform:host-window:get-pointer-position",
  ),
  setAlwaysOnTop: defineInvokeEventa<EmptyPayload, boolean>(
    "kirie:platform:host-window:set-always-on-top",
  ),
  setPointerPassthrough: defineInvokeEventa<EmptyPayload, boolean>(
    "kirie:platform:host-window:set-pointer-passthrough",
  ),
};

export function createPlatformClient(context: KirieEventaContext): PlatformClient {
  const invokes = defineInvokes(context, events);
  return {
    hostWindow: {
      getPointerPosition() {
        return invokes.getPointerPosition({});
      },
      async setPointerPassthrough(enabled) {
        await invokes.setPointerPassthrough(enabled);
      },
      async beginMove() {
        await invokes.beginMove({});
      },
      async beginResize(edge) {
        await invokes.beginResize(edge);
      },
      async setAlwaysOnTop(enabled) {
        await invokes.setAlwaysOnTop(enabled);
      },
      async centerOnCurrentDisplay() {
        await invokes.center({});
      },
    },
  };
}
