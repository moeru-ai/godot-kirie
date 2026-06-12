import { defineKirieConfig } from "@gd-kirie/cli";

export default defineKirieConfig({
  web: {
    vite: {
      build: {
        sourcemap: true,
      },
    },
  },
});
