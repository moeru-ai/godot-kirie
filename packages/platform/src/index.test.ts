import type { KirieEventaContext } from "@gd-kirie/ipc-eventa";
import type { HostWindowState } from "./index";
import { createContext, defineEventa } from "@moeru/eventa";

import { describe, expect, it } from "vitest";
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
});

describe("external URLs", () => {
  it("sends an external URL through the Platform wire contract", async () => {
    const context = createContext() as KirieEventaContext;
    const platform = createPlatformClient(context);
    const url = "https://example.com/settings";

    context.on(
      defineEventa<{ content: string; invokeId: string }>("kirie:platform:open-external-url-send"),
      ({ body }) => {
        if (!body) {
          throw new Error("Platform external URL request has no body.");
        }

        expect(body.content).toBe(url);
        context.emit(
          defineEventa<{ content: Record<string, never>; invokeId: string }>(
            `kirie:platform:open-external-url-receive-${body.invokeId}`,
          ),
          { content: {}, invokeId: body.invokeId },
        );
      },
    );

    await expect(platform.openExternalUrl(url)).resolves.toBeUndefined();
  });
});

describe("application data directory", () => {
  it("opens and returns the directory through the Platform wire contract", async () => {
    const context = createContext() as KirieEventaContext;
    const platform = createPlatformClient(context);
    const path = "/Users/example/Library/Application Support/Kirie";

    context.on(
      defineEventa<{ content: Record<string, never>; invokeId: string }>(
        "kirie:platform:open-application-data-directory-send",
      ),
      ({ body }) => {
        if (!body) {
          throw new Error("Platform application data request has no body.");
        }

        context.emit(
          defineEventa<{ content: string; invokeId: string }>(
            `kirie:platform:open-application-data-directory-receive-${body.invokeId}`,
          ),
          { content: path, invokeId: body.invokeId },
        );
      },
    );

    await expect(platform.openApplicationDataDirectory()).resolves.toBe(path);
  });
});
