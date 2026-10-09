import Vue from "@vitejs/plugin-vue";
import { defineKirieConfig } from "kirie";
import core from "kirie/core";
import UnoCSS from "unocss/vite";

export default defineKirieConfig({
  plugins: [core],
  web: {
    vite: {
      plugins: [Vue(), UnoCSS()],
      build: {
        emptyOutDir: true,
        sourcemap: true,
      },
    },
  },
});
