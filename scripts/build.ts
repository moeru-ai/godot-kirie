export { runExample } from "./build-examples.ts";

export {
  buildIntegrationAndroid,
  buildIntegrationIos,
  buildIntegrationWeb,
} from "./build-integration.ts";
export {
  buildAndroidAar,
  buildIosDebugXcframework,
  buildIosXcframework,
  checkAddonPack,
  packAddon,
  testSwift,
} from "./build-kirie.ts";
export {
  buildSwiftuiEmbeddedAndroid,
  buildSwiftuiEmbeddedIos,
  runSwiftuiEmbeddedAndroidEmulator,
  runSwiftuiEmbeddedIosDevice,
  runSwiftuiEmbeddedIosSimulator,
} from "./build-swiftui-embedded.ts";

// mise task entrypoints re-exported from the integration host runner.
export {
  runIntegrationAndroidTest,
  runIntegrationDesktopTest,
  runIntegrationIosTest,
} from "./integration-runner.ts";
