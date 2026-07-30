<script setup lang="ts">
import { sendText } from "@gd-kirie/ipc";
import { f7App, f7View } from "framework7-vue";
import { onBeforeUnmount, onMounted, reactive } from "vue";

import {
  initialEdgeGestureState,
  reduceEdgeGesture,
  type EdgeGestureAction,
} from "./edgeGesture";
import GestureStatus from "./components/GestureStatus.vue";
import { routes } from "./routes";

interface SwipeBackMoveData {
  percentage?: number;
  progress?: number;
}

const gesture = reactive({ ...initialEdgeGestureState });
const appParameters = {
  name: "Kirie Framework7 Swipe Back",
  theme: "ios" as const,
  routes,
};
const usesTouchEvents = "ontouchstart" in window;

function dispatch(action: EdgeGestureAction): void {
  Object.assign(gesture, reduceEdgeGesture(gesture, action));
}

function report(type: string): void {
  const message = JSON.stringify({
    type,
    payload: {
      phase: gesture.phase,
      startX: gesture.startX,
      deltaX: gesture.deltaX,
      progress: gesture.framework7Progress,
    },
  });

  try {
    sendText(message);
  } catch {
    console.log(message);
  }
}

function onPointerDown(event: PointerEvent): void {
  if (!event.isPrimary) return;
  dispatch({ type: "contact-start", x: event.clientX });
}

function onPointerMove(event: PointerEvent): void {
  if (!event.isPrimary || gesture.startX === null) return;
  dispatch({ type: "contact-move", x: event.clientX });
}

function onPointerUp(event: PointerEvent): void {
  if (!event.isPrimary) return;
  dispatch({ type: "contact-end" });
}

function onTouchStart(event: TouchEvent): void {
  const touch = event.targetTouches[0];
  if (!touch) return;
  dispatch({ type: "contact-start", x: touch.clientX });
}

function onTouchMove(event: TouchEvent): void {
  const touch = event.targetTouches[0];
  if (!touch || gesture.startX === null) return;
  dispatch({ type: "contact-move", x: touch.clientX });
}

function onContactEnd(): void {
  dispatch({ type: "contact-end" });
}

function onSwipeBackMove(data: SwipeBackMoveData): void {
  dispatch({ type: "swipeback-move", progress: data.progress ?? data.percentage ?? 0 });
}

function onSwipeBackAfterChange(): void {
  dispatch({ type: "swipeback-change" });
  report("swipeback_after_change");
}

function onSwipeBackAfterReset(): void {
  dispatch({ type: "swipeback-reset" });
  report("swipeback_after_reset");
}

onMounted(() => {
  if (usesTouchEvents) {
    window.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    window.addEventListener("touchmove", onTouchMove, { capture: true, passive: true });
    window.addEventListener("touchend", onContactEnd, { capture: true, passive: true });
    window.addEventListener("touchcancel", onContactEnd, { capture: true, passive: true });
  } else {
    window.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
    window.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
    window.addEventListener("pointerup", onPointerUp, { capture: true, passive: true });
    window.addEventListener("pointercancel", onPointerUp, { capture: true, passive: true });
  }
  report("web_ready");
});

onBeforeUnmount(() => {
  if (usesTouchEvents) {
    window.removeEventListener("touchstart", onTouchStart, { capture: true });
    window.removeEventListener("touchmove", onTouchMove, { capture: true });
    window.removeEventListener("touchend", onContactEnd, { capture: true });
    window.removeEventListener("touchcancel", onContactEnd, { capture: true });
  } else {
    window.removeEventListener("pointerdown", onPointerDown, { capture: true });
    window.removeEventListener("pointermove", onPointerMove, { capture: true });
    window.removeEventListener("pointerup", onPointerUp, { capture: true });
    window.removeEventListener("pointercancel", onPointerUp, { capture: true });
  }
});
</script>

<template>
  <f7App v-bind="appParameters">
    <f7View
      main
      url="/"
      class="safe-areas"
      :preload-previous-page="true"
      :ios-swipe-back="true"
      :ios-swipe-back-active-area="30"
      :ios-swipe-back-threshold="0"
      @swipeback:move="onSwipeBackMove"
      @swipeback:afterchange="onSwipeBackAfterChange"
      @swipeback:afterreset="onSwipeBackAfterReset"
    />
    <GestureStatus :state="gesture" />
  </f7App>
</template>
