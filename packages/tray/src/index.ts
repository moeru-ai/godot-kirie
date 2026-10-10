import type { KirieEventaContext } from "@gd-kirie/ipc-eventa";
import type { InboundEventa } from "@moeru/eventa";
import { defineInboundEventa, defineInvokeEventa, defineInvokes } from "@moeru/eventa";

export type TrayMenuItemType = "item" | "check" | "radio" | "multistate" | "separator" | "submenu";

export interface TrayConfiguration {
  icon: string;
  /** Render the icon as a macOS template image. Non-macOS hosts reject `true`. */
  iconAsTemplate?: boolean;
  tooltip?: string;
  visible?: boolean;
}

export interface TrayMenuItem {
  id: string;
  text: string;
  type?: TrayMenuItemType;
  icon?: string;
  accelerator?: number;
  disabled?: boolean;
  checked?: boolean;
  state?: number;
  maxStates?: number;
  tooltip?: string;
  indent?: number;
  children?: TrayMenuItem[];
}

export interface TrayMenuItemUpdate extends Omit<Partial<TrayMenuItem>, "id" | "type" | "children"> {
  id: string;
  clearIcon?: boolean;
}

export interface TrayClient {
  configure: (configuration: TrayConfiguration) => Promise<void>;
  setMenu: (items: TrayMenuItem[]) => Promise<void>;
  updateItem: (update: TrayMenuItemUpdate) => Promise<void>;
  destroy: () => Promise<void>;
}

type EmptyPayload = Record<string, never>;

const events = {
  configure: defineInvokeEventa<EmptyPayload, TrayConfiguration>("kirie:tray:configure"),
  setMenu: defineInvokeEventa<EmptyPayload, TrayMenuItem[]>("kirie:tray:set-menu"),
  updateItem: defineInvokeEventa<EmptyPayload, TrayMenuItemUpdate>("kirie:tray:update-item"),
  destroy: defineInvokeEventa<EmptyPayload, EmptyPayload>("kirie:tray:destroy"),
};

export const trayMenuItemActivated: InboundEventa<{ id: string }> = defineInboundEventa(
  "kirie:tray:menu-item-activated",
);

export function createTrayClient(context: KirieEventaContext): TrayClient {
  const invokes = defineInvokes(context, events);

  return {
    async configure(configuration) {
      await invokes.configure(configuration);
    },
    async setMenu(items) {
      await invokes.setMenu(items);
    },
    async updateItem(update) {
      await invokes.updateItem(update);
    },
    async destroy() {
      await invokes.destroy({});
    },
  };
}
