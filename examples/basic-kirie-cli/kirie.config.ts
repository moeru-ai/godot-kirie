import { defineKirieConfig } from "kirie";
import core from "kirie/plugin/core";

export default defineKirieConfig({
  plugins: [core],
  web: {
    vite: {
      build: {
        sourcemap: true,
      },
    },
  },
});
