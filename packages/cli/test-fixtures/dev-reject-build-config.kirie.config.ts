import core from "@gd-kirie/core";

export default ({ command }) => {
  if (command === "build") {
    throw new Error("dev should reuse the serve config");
  }

  return {
    godot: {
      args: ["fake-godot.js"],
      command: process.execPath,
    },
    plugins: [core],
    web: {
      vite: { logLevel: "silent" },
    },
  };
};
