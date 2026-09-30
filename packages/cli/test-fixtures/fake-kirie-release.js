import packageJson from "../package.json" with { type: "json" };
import release from "./kirie-release.json" with { type: "json" };

const releaseUrl = `https://api.github.com/repos/moeru-ai/godot-kirie/releases/tags/v${packageJson.version}`;

globalThis.fetch = async (input) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url !== releaseUrl) {
    throw new Error(`Unexpected fixture request: ${url}`);
  }
  return Response.json(release);
};
