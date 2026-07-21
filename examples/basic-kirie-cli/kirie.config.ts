import { defineKirieConfig } from "kirie";

export default defineKirieConfig({
  web: {
    vite: {
      build: {
        sourcemap: true,
      },
    },
  },
});
