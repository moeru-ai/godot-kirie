export { runExample } from "./build-examples.ts";

export {
  buildIntegrationAndroid,
  buildIntegrationIos,
  buildIntegrationWeb,
} from "./build-integration.ts";
export {
  buildAndroidAar,
  buildIosXcframework,
  checkAddonPack,
  installGodotCef,
  packAddon,
  testIosIpcSerialization,
} from "./build-kirie.ts";

// mise task entrypoints re-exported from the integration host runner.
export {
  runIntegrationAndroidTest,
  runIntegrationDesktopTest,
  runIntegrationIosTest,
} from "./integration-runner.ts";
