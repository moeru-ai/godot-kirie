<script setup lang="ts">
import type { EdgeGestureState } from "../edgeGesture";

defineProps<{
  state: EdgeGestureState;
}>();
</script>

<template>
  <aside
    class="pointer-events-none fixed bottom-[calc(12px+env(safe-area-inset-bottom))] left-1/2 z-10000 w-[min(92vw,430px)] -translate-x-1/2 rounded-4 bg-black/86 p-3 text-white shadow-xl backdrop-blur"
  >
    <div class="mb-2 flex items-center justify-between gap-3">
      <strong class="text-sm">Edge gesture state</strong>
      <span class="rounded-full bg-white/15 px-2 py-1 font-mono text-xs">{{ state.phase }}</span>
    </div>
    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs">
      <dt class="text-white/60">start x</dt>
      <dd>{{ state.startX === null ? "—" : `${state.startX.toFixed(1)} px` }}</dd>
      <dt class="text-white/60">inside 30 px</dt>
      <dd>{{ state.startedInActiveArea ? "yes" : "no" }}</dd>
      <dt class="text-white/60">delta x</dt>
      <dd>{{ state.deltaX.toFixed(1) }} px</dd>
      <dt class="text-white/60">F7 progress</dt>
      <dd>{{ Math.round(state.framework7Progress * 100) }}%</dd>
    </dl>
    <p class="mb-0 mt-2 text-xs text-white/78">
      {{ state.lastResult }}
    </p>
  </aside>
</template>
