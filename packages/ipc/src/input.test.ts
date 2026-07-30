import { decode } from "cborg";
import { afterEach, describe, expect, it, vi } from "vitest";

import { installPointerEventForwarding } from "./index";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  });
});

describe("installPointerEventForwarding", () => {
  it("sends normalized pointer input over the Kirie data lane", () => {
    const postMessage = vi.fn();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        kirie: {
          platform: {
            os: "android",
            backend: "webview",
          },
        },
        KirieDataChannel: { postMessage },
      },
    });

    const target = installTestDocument();
    installPointerEventForwarding();
    target.dispatchEvent(
      pointerEvent("pointerdown", 7, 1, {
        pointerType: "touch",
        clientX: 120,
        clientY: 80,
        pressure: 0.75,
        view: {
          innerWidth: 480,
          innerHeight: 320,
        },
      }),
    );

    expect(postMessage).toHaveBeenCalledTimes(1);
    const packet = decode(new Uint8Array(postMessage.mock.calls[0]?.[0] as ArrayBuffer));
    expect(packet).toEqual({
      __gd_kirie_control_v1: {
        version: 1,
        kind: "pointer",
        phase: "down",
        pointer_id: 7,
        pointer_type: "touch",
        normalized_x: 0.25,
        normalized_y: 0.25,
        button: 0,
        buttons: 1,
        pressure: 0.75,
      },
    });
  });

  it("forwards complete claimed pointer sequences and ignores orphan endings", () => {
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

    const target = installTestDocument();
    const removePointerForwarding = installPointerEventForwarding();

    target.dispatchEvent(pointerEvent("pointerup", 7, 0));
    target.dispatchEvent(pointerEvent("pointerdown", 7, 1));
    target.dispatchEvent(pointerEvent("pointermove", 7, 1));
    target.dispatchEvent(pointerEvent("pointerup", 7, 0));
    target.dispatchEvent(pointerEvent("pointerup", 7, 0));

    expect(
      postMessage.mock.calls.map(([bytes]) => {
        const packet = decode(new Uint8Array(bytes as ArrayBuffer)) as {
          __gd_kirie_control_v1: { phase: string };
        };
        return packet.__gd_kirie_control_v1.phase;
      }),
    ).toEqual(["down", "move", "up"]);

    removePointerForwarding();
    target.dispatchEvent(pointerEvent("pointerdown", 8, 1));
    expect(postMessage).toHaveBeenCalledTimes(3);
  });

  it("cancels claimed pointers when forwarding is removed", () => {
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

    const target = installTestDocument();
    const removePointerForwarding = installPointerEventForwarding();
    target.dispatchEvent(pointerEvent("pointerdown", 9, 1));
    removePointerForwarding();

    expect(
      postMessage.mock.calls.map(([bytes]) => {
        const packet = decode(new Uint8Array(bytes as ArrayBuffer)) as {
          __gd_kirie_control_v1: { phase: string };
        };
        return packet.__gd_kirie_control_v1.phase;
      }),
    ).toEqual(["down", "cancel"]);
  });
});

interface PointerEventOverrides {
  pointerType?: string;
  clientX?: number;
  clientY?: number;
  pressure?: number;
  view?: { innerWidth: number; innerHeight: number } | null;
}

function installTestDocument(): EventTarget {
  const target = new EventTarget();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: target,
  });
  return target;
}

function pointerEvent(
  type: string,
  pointerId: number,
  buttons: number,
  overrides: PointerEventOverrides = {},
): Event {
  const event = new Event(type);
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: overrides.pointerType ?? "mouse" },
    clientX: { value: overrides.clientX ?? 100 },
    clientY: { value: overrides.clientY ?? 75 },
    button: { value: 0 },
    buttons: { value: buttons },
    pressure: { value: overrides.pressure ?? (buttons === 0 ? 0 : 0.5) },
    view: { value: overrides.view ?? null },
  });
  return event;
}
