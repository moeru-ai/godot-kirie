<script setup lang="ts">
import type { TrayMenuItem } from "@gd-kirie/platform";
import { createContext } from "@gd-kirie/ipc-eventa";
import { createPlatformClient, trayMenuItemActivated } from "@gd-kirie/platform";
import Button from "@proj-airi/ui/src/components/misc/button.vue";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

interface MenuNode {
  id: string;
  text: string;
  children: MenuNode[];
}

interface TreeRow {
  node: MenuNode;
  path: number[];
  depth: number;
}

const eventa = window.kirie ? createContext() : undefined;
const platform = eventa ? createPlatformClient(eventa.context) : undefined;
const menuItems = ref<MenuNode[]>([
  { id: "open", text: "Open Kirie", children: [] },
  {
    id: "tools",
    text: "Tools",
    children: [
      { id: "refresh", text: "Refresh", children: [] },
      { id: "settings", text: "Settings", children: [] },
    ],
  },
  { id: "quit", text: "Quit", children: [] },
]);
const lastClickedId = ref("");
const trayReady = ref(false);
const status = ref(platform ? "Connecting to host…" : "Browser preview");
let nextId = 1;
let syncTimer: number | undefined;
let stopTrayActivation: (() => void) | undefined;

function flatten(nodes: MenuNode[], parentPath: number[] = [], depth = 0): TreeRow[] {
  return nodes.flatMap((node, index) => {
    const path = [...parentPath, index];
    return [
      { node, path, depth },
      ...flatten(node.children, path, depth + 1),
    ];
  });
}

const rows = computed(() => flatten(menuItems.value));

function createNode(): MenuNode {
  const id = `item-${Date.now()}-${nextId++}`;
  return { id, text: "New item", children: [] };
}

function getSiblings(path: number[]): MenuNode[] {
  let siblings = menuItems.value;
  for (const index of path.slice(0, -1))
    siblings = siblings[index].children;
  return siblings;
}

function addRoot(): void {
  menuItems.value.push(createNode());
}

function addAfter(path: number[]): void {
  getSiblings(path).splice(path.at(-1)! + 1, 0, createNode());
}

function addChild(path: number[]): void {
  getSiblings(path)[path.at(-1)!].children.push(createNode());
}

function removeItem(path: number[]): void {
  getSiblings(path).splice(path.at(-1)!, 1);
}

function moveItem(path: number[], offset: number): void {
  const siblings = getSiblings(path);
  const index = path.at(-1)!;
  const target = index + offset;
  if (target < 0 || target >= siblings.length)
    return;

  [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
}

function indentItem(path: number[]): void {
  const siblings = getSiblings(path);
  const index = path.at(-1)!;
  if (index === 0)
    return;

  const [node] = siblings.splice(index, 1);
  siblings[index - 1].children.push(node);
}

function outdentItem(path: number[]): void {
  if (path.length < 2)
    return;

  const parentPath = path.slice(0, -1);
  const parentIndex = parentPath.at(-1)!;
  const [node] = getSiblings(path).splice(path.at(-1)!, 1);
  getSiblings(parentPath).splice(parentIndex + 1, 0, node);
}

function canMove(path: number[], offset: number): boolean {
  const target = path.at(-1)! + offset;
  return target >= 0 && target < getSiblings(path).length;
}

function toTrayItem(node: MenuNode): TrayMenuItem {
  const hasChildren = node.children.length > 0;
  return {
    id: node.id,
    text: node.text.trim() || "Untitled item",
    type: hasChildren ? "submenu" : "item",
    children: hasChildren ? node.children.map(toTrayItem) : undefined,
  };
}

async function syncTrayMenu(): Promise<void> {
  if (!platform || !trayReady.value)
    return;

  await platform.tray.setMenu(menuItems.value.map(toTrayItem));
  status.value = "Tray menu synced";
}

function reportError(error: unknown): void {
  console.error(error);
  status.value = error instanceof Error ? error.message : String(error);
}

function scheduleTraySync(): void {
  if (!trayReady.value)
    return;

  window.clearTimeout(syncTimer);
  status.value = "Syncing changes…";
  syncTimer = window.setTimeout(() => syncTrayMenu().catch(reportError), 120);
}

watch(menuItems, scheduleTraySync, { deep: true });

onMounted(async () => {
  if (!eventa || !platform)
    return;

  stopTrayActivation = eventa.context.on(trayMenuItemActivated, ({ body }) => {
    if (body)
      lastClickedId.value = body.id;
  });

  try {
    await platform.tray.configure({ icon: "res://icon.svg", tooltip: "Kirie Tray Editor" });
    trayReady.value = true;
    await syncTrayMenu();
  } catch (error) {
    reportError(error);
  }
});

onBeforeUnmount(() => {
  window.clearTimeout(syncTimer);
  stopTrayActivation?.();
  eventa?.dispose();
});
</script>

<template>
  <main class="min-h-screen bg-neutral-50 p-5 text-neutral-900 md:p-8">
    <div class="mx-auto max-w-5xl flex flex-col gap-5">
      <header class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">
            Kirie Tray
          </h1>
          <p class="mt-1 text-sm text-neutral-500">
            Edit the tree, then open the system tray menu
          </p>
        </div>
        <p class="font-mono text-xs text-neutral-500">
          {{ status }}
        </p>
      </header>

      <section class="rounded-2xl border-2 border-neutral-200 bg-white/70 p-5 shadow-sm md:p-6">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold">
              Menu tree
            </h2>
            <p class="mt-1 text-xs text-neutral-500">
              Items with children become native submenus.
            </p>
          </div>
          <Button label="Add root item" size="sm" variant="primary" @click="addRoot" />
        </div>

        <div v-if="rows.length" class="flex flex-col gap-2">
          <article
            v-for="row in rows"
            :key="row.node.id"
            class="tree-row rounded-xl border border-neutral-200 bg-white p-3 shadow-sm"
            :style="{ marginLeft: `${row.depth * 20}px` }"
          >
            <div class="min-w-0 flex flex-1 items-center gap-2">
              <span class="w-14 shrink-0 font-mono text-xs text-neutral-400">
                {{ row.depth === 0 ? "root" : `level ${row.depth}` }}
              </span>
              <input
                v-model="row.node.text"
                :aria-label="`Label for ${row.node.text}`"
                class="min-w-32 flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              >
              <span
                v-if="row.node.id === lastClickedId"
                class="shrink-0 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"
              >
                Last clicked
              </span>
            </div>
            <div class="mt-2 flex flex-wrap justify-end gap-1.5 md:mt-0 md:w-96 md:shrink-0">
              <button class="tree-action" type="button" @click="addAfter(row.path)">
                Add after
              </button>
              <button class="tree-action" type="button" @click="addChild(row.path)">
                Add child
              </button>
              <button class="tree-action" type="button" :disabled="!canMove(row.path, -1)" @click="moveItem(row.path, -1)">
                Up
              </button>
              <button class="tree-action" type="button" :disabled="!canMove(row.path, 1)" @click="moveItem(row.path, 1)">
                Down
              </button>
              <button class="tree-action" type="button" :disabled="row.path.at(-1) === 0" @click="indentItem(row.path)">
                Indent
              </button>
              <button class="tree-action" type="button" :disabled="row.depth === 0" @click="outdentItem(row.path)">
                Outdent
              </button>
              <button class="tree-action tree-action-danger" type="button" @click="removeItem(row.path)">
                Delete
              </button>
            </div>
          </article>
        </div>

        <div v-else class="rounded-xl border border-dashed border-neutral-300 p-8 text-center">
          <p class="text-sm text-neutral-500">
            The tray menu is empty.
          </p>
          <button class="mt-3 text-sm font-medium text-primary-600" type="button" @click="addRoot">
            Add the first item
          </button>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.tree-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.tree-action {
  border: 1px solid rgb(229 229 229);
  border-radius: 0.5rem;
  padding: 0.375rem 0.625rem;
  color: rgb(82 82 82);
  font-size: 0.75rem;
  line-height: 1rem;
  transition:
    background-color 120ms,
    border-color 120ms;
}

.tree-action:hover:not(:disabled) {
  border-color: rgb(163 163 163);
  background: rgb(245 245 245);
}

.tree-action:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.tree-action-danger {
  color: rgb(185 28 28);
}

@media (max-width: 767px) {
  .tree-row {
    display: block;
  }
}
</style>
