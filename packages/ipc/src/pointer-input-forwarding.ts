import type { KirieData } from "./index";

type KiriePointerPhase = "down" | "move" | "up" | "cancel";
type KiriePointerType = "mouse" | "pen" | "touch";

interface KiriePointerInputRecord extends Record<string, KirieData> {
  kind: "pointer";
  phase: KiriePointerPhase;
  pointer_id: number;
  pointer_type: KiriePointerType;
  normalized_x: number;
  normalized_y: number;
  button: number;
  buttons: number;
  pressure: number;
}

interface KirieControlRecord extends Record<string, KirieData> {
  __gd_kirie_control: KiriePointerInputRecord;
}

type SendData = (value: KirieData) => void;

function forwardPointerEvent(
  sendData: SendData,
  event: PointerEvent,
  phase = pointerPhase(event.type),
): void {
  const view = event.view ?? window;
  if (view.innerWidth <= 0 || view.innerHeight <= 0) {
    throw new RangeError("Kirie cannot forward pointer input from an empty viewport.");
  }

  const pointerType = event.pointerType;
  if (pointerType !== "mouse" && pointerType !== "pen" && pointerType !== "touch") {
    throw new TypeError(`Kirie cannot forward pointer type: ${pointerType}`);
  }

  sendData({
    __gd_kirie_control: {
      kind: "pointer",
      phase,
      pointer_id: event.pointerId,
      pointer_type: pointerType,
      normalized_x: event.clientX / view.innerWidth,
      normalized_y: event.clientY / view.innerHeight,
      button: event.button,
      buttons: event.buttons,
      pressure: event.pressure,
    },
  } satisfies KirieControlRecord);
}

export function installPointerEventForwarding(sendData: SendData): () => void {
  // A sequence is claimed only when its down event reaches the document bubble phase.
  const claimedPointers = new Map<number, PointerEvent>();

  /**
   * Claims a pointer sequence when its down event reaches the document bubbling phase.
   *
   * Triggering workflow:
   *
   * {@link installPointerEventForwarding}
   *   -> {@link EventTarget.addEventListener}
   *     -> `pointerdown`
   *       -> {@link handlePointerDown}
   *
   * Upstream:
   * - {@link EventTarget.addEventListener}
   *
   * Downstream:
   * - {@link forwardPointerEvent}
   */
  const handlePointerDown = (event: Event): void => {
    const pointerEvent = event as PointerEvent;
    forwardPointerEvent(sendData, pointerEvent);
    claimedPointers.set(pointerEvent.pointerId, pointerEvent);
  };

  /**
   * Completes a claimed pointer sequence even if it later crosses a web-owned region.
   *
   * Triggering workflow:
   *
   * {@link installPointerEventForwarding}
   *   -> {@link EventTarget.addEventListener}
   *     -> `pointermove|pointerup|pointercancel`
   *       -> {@link handleClaimedPointerEvent}
   *
   * Upstream:
   * - {@link EventTarget.addEventListener}
   *
   * Downstream:
   * - {@link forwardPointerEvent}
   */
  const handleClaimedPointerEvent = (event: Event): void => {
    const pointerEvent = event as PointerEvent;
    if (!claimedPointers.has(pointerEvent.pointerId)) {
      return;
    }

    forwardPointerEvent(sendData, pointerEvent);
    if (pointerEvent.type === "pointerup" || pointerEvent.type === "pointercancel") {
      claimedPointers.delete(pointerEvent.pointerId);
      return;
    }

    claimedPointers.set(pointerEvent.pointerId, pointerEvent);
  };

  /**
   * Forwards unpressed mouse hover only when it reaches the document bubbling phase.
   *
   * Triggering workflow:
   *
   * {@link installPointerEventForwarding}
   *   -> {@link EventTarget.addEventListener}
   *     -> `pointermove`
   *       -> {@link handlePointerHover}
   *
   * Upstream:
   * - {@link EventTarget.addEventListener}
   *
   * Downstream:
   * - {@link forwardPointerEvent}
   */
  const handlePointerHover = (event: Event): void => {
    const pointerEvent = event as PointerEvent;
    if (
      claimedPointers.has(pointerEvent.pointerId) ||
      pointerEvent.pointerType !== "mouse" ||
      pointerEvent.buttons !== 0
    ) {
      return;
    }

    forwardPointerEvent(sendData, pointerEvent);
  };

  document.addEventListener("pointerdown", handlePointerDown);
  document.addEventListener("pointermove", handleClaimedPointerEvent, true);
  document.addEventListener("pointerup", handleClaimedPointerEvent, true);
  document.addEventListener("pointercancel", handleClaimedPointerEvent, true);
  document.addEventListener("pointermove", handlePointerHover);

  /**
   * Removes document listeners and cancels pointer sequences claimed by this installation.
   *
   * Triggering workflow:
   *
   * {@link installPointerEventForwarding}
   *   -> caller-owned disposer
   *     -> `dispose`
   *       -> {@link removePointerEventForwarding}
   *
   * Upstream:
   * - caller of {@link installPointerEventForwarding}
   *
   * Downstream:
   * - {@link EventTarget.removeEventListener}
   * - {@link forwardPointerEvent}
   */
  const removePointerEventForwarding = (): void => {
    document.removeEventListener("pointerdown", handlePointerDown);
    document.removeEventListener("pointermove", handleClaimedPointerEvent, true);
    document.removeEventListener("pointerup", handleClaimedPointerEvent, true);
    document.removeEventListener("pointercancel", handleClaimedPointerEvent, true);
    document.removeEventListener("pointermove", handlePointerHover);

    for (const pointerEvent of claimedPointers.values()) {
      forwardPointerEvent(sendData, pointerEvent, "cancel");
    }
    claimedPointers.clear();
  };

  return removePointerEventForwarding;
}

function pointerPhase(eventType: string): KiriePointerPhase {
  switch (eventType) {
    case "pointerdown":
      return "down";
    case "pointermove":
      return "move";
    case "pointerup":
      return "up";
    case "pointercancel":
      return "cancel";
    default:
      throw new TypeError(`Kirie cannot forward pointer event type: ${eventType}`);
  }
}
