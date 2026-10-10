import tray from "@gd-kirie/tray/plugin";
import Vue from "@vitejs/plugin-vue";
import { defineKirieConfig } from "kirie";
import core from "kirie/plugin/core";
import UnoCSS from "unocss/vite";

export default defineKirieConfig({
  plugins: [core, tray],
  web: {
    vite: {
      plugins: [Vue(), UnoCSS()],
      build: { emptyOutDir: true, sourcemap: true },
    },
  },
});
