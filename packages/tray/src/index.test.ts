import type { KirieEventaContext } from "@gd-kirie/ipc-eventa";
import type { TrayConfiguration } from "./index";
import { createContext, defineEventa } from "@moeru/eventa";
import { describe, expect, it } from "vitest";
import { createTrayClient } from "./index";

describe("system tray", () => {
  it("configures the host through the Tray wire contract", async () => {
    const context = createContext() as KirieEventaContext;
    const tray = createTrayClient(context);
    const configuration = {
      icon: "res://tray-template.svg",
      iconAsTemplate: true,
      tooltip: "Kirie",
      visible: true,
    };

    context.on(
      defineEventa<{ content: TrayConfiguration; invokeId: string }>("kirie:tray:configure-send"),
      ({ body }) => {
        if (!body) {
          throw new Error("Tray request has no body.");
        }

        expect(body.content).toEqual(configuration);
        context.emit(
          defineEventa<{ content: Record<string, never>; invokeId: string }>(
            `kirie:tray:configure-receive-${body.invokeId}`,
          ),
          { content: {}, invokeId: body.invokeId },
        );
      },
    );

    await expect(tray.configure(configuration)).resolves.toBeUndefined();
  });
});
