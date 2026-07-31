import { decode } from "cborg";
import { afterEach, expect, it, vi } from "vitest";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

afterEach(() => {
  vi.resetModules();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  });
});

it("registers pointer forwarding when imported", async () => {
  const postMessage = vi.fn();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      innerWidth: 400,
      innerHeight: 300,
      kirie: {
        platform: {
          os: "android",
          backend: "webview",
        },
      },
      KirieDataChannel: { postMessage },
    },
  });

  const documentTarget = new EventTarget();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentTarget,
  });

  await import("./auto");
  documentTarget.dispatchEvent(pointerEvent("pointerdown"));

  expect(postMessage).toHaveBeenCalledTimes(1);
  const packet = decode(new Uint8Array(postMessage.mock.calls[0]?.[0] as ArrayBuffer)) as {
    __gd_kirie_control: { phase: string };
  };
  expect(packet.__gd_kirie_control.phase).toBe("down");
});

function pointerEvent(type: string): Event {
  const event = new Event(type);
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: "mouse" },
    clientX: { value: 100 },
    clientY: { value: 75 },
    button: { value: 0 },
    buttons: { value: 1 },
    pressure: { value: 0.5 },
    view: { value: null },
  });
  return event;
}
