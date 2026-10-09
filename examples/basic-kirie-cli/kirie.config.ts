import { defineKirieConfig } from "kirie";
import core from "kirie/core";

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
