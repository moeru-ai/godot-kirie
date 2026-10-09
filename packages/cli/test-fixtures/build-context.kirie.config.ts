import core from "@gd-kirie/core";

export default ({ command, mode }) => {
  if (command !== "build" || mode !== "production") {
    throw new Error(`Unexpected config context: ${command} ${mode}`);
  }

  return {
    plugins: [core],
    web: {
      vite: { build: { sourcemap: true } },
    },
  };
};
