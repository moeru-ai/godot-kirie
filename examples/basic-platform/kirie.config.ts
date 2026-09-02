import Vue from "@vitejs/plugin-vue";
import { defineKirieConfig } from "kirie";
import UnoCSS from "unocss/vite";

export default defineKirieConfig({
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
