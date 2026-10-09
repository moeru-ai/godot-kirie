import core from "kirie/core";

export default {
  godot: {
    args: ["fake-godot.js"],
    command: process.execPath,
  },
  plugins: [core],
  web: {
    vite: { logLevel: "silent" },
  },
};
