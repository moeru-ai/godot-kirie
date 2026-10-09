import core from "@gd-kirie/core";

export default {
  plugins: [core],
  web: {
    vite: { build: { outDir: "custom-dist" } },
  },
};
