import type { KirieEventaContext } from "@gd-kirie/ipc-eventa";
import { createContext, defineEventa } from "@moeru/eventa";
import { describe, expect, it, vi } from "vitest";

import type { HostWindowState } from "./index";
import { createPlatformClient } from "./index";

describe("host window state", () => {
  it("gets a state snapshot through the Platform wire contract", async () => {
    const context = createContext() as KirieEventaContext;
    const platform = createPlatformClient(context);
    const state = { focused: true, minimized: false, visible: true };

    context.on(
      defineEventa<{ content: Record<string, never>; invokeId: string }>(
        "kirie:platform:host-window:get-state-send",
      ),
      ({ body }) => {
        if (!body) {
          throw new Error("Platform state request has no body.");
        }

        context.emit(
          defineEventa<{ content: HostWindowState; invokeId: string }>(
            `kirie:platform:host-window:get-state-receive-${body.invokeId}`,
          ),
          { content: state, invokeId: body.invokeId },
        );
      },
    );

    await expect(platform.hostWindow.getState()).resolves.toEqual(state);
  });

  it("subscribes and unsubscribes from state changes", () => {
    const context = createContext() as KirieEventaContext;
    const platform = createPlatformClient(context);
    const listener = vi.fn();
    const stop = platform.hostWindow.onStateChanged(listener);
    const event = defineEventa<HostWindowState>("kirie:platform:host-window:state-changed");
    const state = { focused: false, minimized: true, visible: true };

    context.emit(event, state);
    expect(listener).toHaveBeenCalledWith(state);

    stop();
    context.emit(event, { ...state, minimized: false });
    expect(listener).toHaveBeenCalledOnce();
  });
});
