import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execa } from "execa";
import {
  integrationDistDir,
  integrationProjectDir,
  kirieCliArgs,
  rootDir,
  runKirieCli,
} from "./build-shared.ts";

interface MarkerResult {
  line?: string;
  status: "pass" | "fail" | "timeout" | "stopped";
}

function resolveTestName(
  platform: "android" | "ios" | "desktop",
  testName?: string,
): string | undefined {
  if (!fs.existsSync(`${integrationProjectDir}/project.godot`)) {
    console.error("This task must be run from the repository root.");
    process.exitCode = 1;
    return undefined;
  }

  if (!testName) {
    console.error(`Usage: mise run test:integration-${platform} -- <test_name>`);
    process.exitCode = 1;
    return undefined;
  }

  return testName;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function readLogFile(logFile: string): string {
  return fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "";
}

function prepareLogFile(testName: string): string {
  const logFile =
    process.env.LOG_FILE || path.join(os.tmpdir(), `kirie-integration-${testName}.log`);

  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.writeFileSync(logFile, "");
  return logFile;
}

async function openLogStream(logFile: string): Promise<fs.WriteStream> {
  const logStream = fs.createWriteStream(logFile, { flags: "a" });

  await new Promise<void>((resolve, reject) => {
    logStream.once("open", resolve);
    logStream.once("error", reject);
  });

  return logStream;
}

async function readBundleId(appPath: string): Promise<string> {
  const result = await execa("/usr/libexec/PlistBuddy", [
    "-c",
    "Print :CFBundleIdentifier",
    path.join(appPath, "Info.plist"),
  ]);

  return result.stdout.trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findMarker(options: { logFile: string; testName: string }): MarkerResult | undefined {
  const testNamePattern = escapeRegExp(options.testName);
  const failPattern = new RegExp(`KIRIE_TEST_FAIL (${testNamePattern}|unknown)( |$)`);
  const passPattern = new RegExp(`KIRIE_TEST_PASS ${testNamePattern}( |$)`);
  const lines = readLogFile(options.logFile).split(/\r?\n/);
  const failLine = lines.find((line) => failPattern.test(line));
  if (failLine) {
    return { line: failLine, status: "fail" };
  }

  const passLine = lines.find((line) => passPattern.test(line));
  if (passLine) {
    return { line: passLine, status: "pass" };
  }

  return undefined;
}

async function waitForMarker(options: {
  logFile: string;
  testName: string;
  timeoutSeconds: number;
}): Promise<MarkerResult> {
  const deadline = Date.now() + options.timeoutSeconds * 1000;

  while (Date.now() < deadline) {
    const marker = findMarker(options);
    if (marker) {
      return marker;
    }

    await sleep(500);
  }

  return { status: "timeout" };
}

async function printIntegrationResult(
  result: MarkerResult,
  logFile: string,
  testName: string,
  options: {
    earlyExitSubject?: string;
    logOnFail?: boolean;
    logTailLines?: number;
    settleMilliseconds?: number;
  } = {},
): Promise<void> {
  if (result.status === "pass") {
    console.log(result.line);
    return;
  }

  const logOnFail = options.logOnFail ?? true;
  if (result.status === "fail" && !logOnFail) {
    console.error(result.line);
    process.exitCode = 1;
    return;
  }

  if (result.status === "stopped") {
    console.error(result.line);
  }

  if (result.status === "timeout") {
    console.error(`Timed out waiting for KIRIE_TEST_PASS or KIRIE_TEST_FAIL for ${testName}`);
  } else if (result.status === "stopped" && options.earlyExitSubject) {
    console.error(
      `Timed out (or ${options.earlyExitSubject} exited early) waiting for KIRIE_TEST_PASS or KIRIE_TEST_FAIL for ${testName}`,
    );
  }

  if (options.settleMilliseconds) {
    await sleep(options.settleMilliseconds);
  }

  const log = readLogFile(logFile);
  if (options.logTailLines) {
    console.error(log.split(/\r?\n/).slice(-options.logTailLines).join("\n"));
  } else {
    console.error(`=== Full log: ${logFile} ===`);
    console.error(log);
    console.error("=== End of log ===");
  }

  if (result.status === "fail") {
    console.error(result.line);
  }

  process.exitCode = 1;
}

export async function runIntegrationAndroidTest(testNameArg?: string): Promise<void> {
  const testName = resolveTestName("android", testNameArg);
  if (!testName) {
    return;
  }

  const logFile = prepareLogFile(testName);
  const timeoutSeconds = Number(process.env.TIMEOUT_SECONDS || "120");

  const logStream = await openLogStream(logFile);
  const kirieRun = execa(
    process.execPath,
    kirieCliArgs([
      "run",
      "android",
      "--project",
      path.resolve(rootDir, integrationProjectDir),
      "--force-stop",
      "--clear-data",
      "--clear-logcat",
      "--launch-option",
      `kirie_test=${testName}`,
    ]),
    {
      cwd: rootDir,
      reject: false,
      stderr: "inherit",
      stdout: "pipe",
    },
  );
  if (!kirieRun.stdout) {
    throw new Error("kirie run android did not expose stdout");
  }
  kirieRun.stdout.on("data", (chunk: Buffer | string) => {
    logStream.write(chunk);
    process.stderr.write(chunk);
  });

  const watchedKirieRun = kirieRun.then(
    (): MarkerResult =>
      findMarker({ logFile, testName }) || {
        line: `kirie run android exited before KIRIE_TEST_PASS/FAIL for ${testName}`,
        status: "stopped",
      },
  );

  let result: MarkerResult | undefined;

  try {
    console.error(
      `Waiting up to ${timeoutSeconds}s for KIRIE_TEST_PASS/FAIL for ${testName}; Android log: ${logFile}`,
    );
    result = await Promise.race([
      waitForMarker({ logFile, testName, timeoutSeconds }),
      watchedKirieRun,
    ]);
  } finally {
    kirieRun.kill();
    await watchedKirieRun;
    logStream.end();
  }

  if (result) {
    await printIntegrationResult(result, logFile, testName, {
      logOnFail: false,
      logTailLines: 120,
    });
  }
}

export async function runIntegrationIosTest(testNameArg?: string): Promise<void> {
  const testName = resolveTestName("ios", testNameArg);
  if (!testName) {
    return;
  }

  const simulatorId = process.env.SIMULATOR_ID || "booted";
  const appPath = process.env.APP_PATH || `${integrationDistDir}/ios_debug.app`;
  const timeoutSeconds = Number(process.env.TIMEOUT_SECONDS || "120");
  const logStreamSettleSeconds = Number(process.env.LOG_STREAM_SETTLE_SECONDS || "1");
  const logFile = prepareLogFile(testName);
  const logPredicate =
    process.env.LOG_PREDICATE ||
    'eventMessage CONTAINS "KIRIE_TEST_" OR eventMessage CONTAINS "[Kirie]" OR eventMessage CONTAINS "Godot" OR eventMessage CONTAINS "SCRIPT ERROR" OR eventMessage CONTAINS "ERROR:" OR eventMessage CONTAINS "WARNING:"';

  const logStream = await openLogStream(logFile);
  const logProcess = execa(
    "xcrun",
    [
      "simctl",
      "spawn",
      simulatorId,
      "log",
      "stream",
      "--level",
      "debug",
      "--style",
      "compact",
      "--predicate",
      logPredicate,
    ],
    { cwd: rootDir, reject: false, stderr: logStream, stdout: logStream },
  );
  await sleep(logStreamSettleSeconds * 1000);

  let result: MarkerResult | undefined;

  try {
    await runKirieCli([
      "run",
      "ios",
      "--project",
      path.resolve(rootDir, integrationProjectDir),
      "--app",
      path.resolve(rootDir, appPath),
      "--device",
      simulatorId,
      "--terminate-existing",
      "--launch-option",
      `kirie_test=${testName}`,
    ]);
    result = await Promise.race([
      waitForMarker({ logFile, testName, timeoutSeconds }),
      logProcess.then(
        (logProcessResult): MarkerResult => ({
          line: logProcessResult.signal
            ? `iOS log stream exited with signal ${logProcessResult.signal} before ${testName} finished`
            : `iOS log stream exited with code ${logProcessResult.exitCode ?? "unknown"} before ${testName} finished`,
          status: "stopped",
        }),
      ),
    ]);
  } finally {
    logProcess.kill();
    const logProcessResult = await logProcess;
    if (result?.status === "pass" && logProcessResult.failed) {
      if (logProcessResult.signal !== "SIGTERM" && logProcessResult.exitCode !== 143) {
        result = {
          line: logProcessResult.signal
            ? `iOS log stream exited with signal ${logProcessResult.signal} during cleanup`
            : `iOS log stream exited with code ${logProcessResult.exitCode ?? "unknown"} during cleanup`,
          status: "stopped",
        };
      }
    }
    logStream.end();
    const bundleId = await readBundleId(path.resolve(rootDir, appPath));
    await execa("xcrun", ["simctl", "terminate", simulatorId, bundleId], {
      cwd: rootDir,
      reject: false,
      stderr: "ignore",
      stdout: "ignore",
    });
  }

  if (result) {
    await printIntegrationResult(result, logFile, testName, {
      earlyExitSubject: "app",
      settleMilliseconds: 300,
    });
  }
}

export async function runIntegrationDesktopTest(testNameArg?: string): Promise<void> {
  const testName = resolveTestName("desktop", testNameArg);
  if (!testName) {
    return;
  }

  const webIndex = `${integrationProjectDir}/src-web/dist/index.html`;
  if (!fs.existsSync(webIndex)) {
    console.error("Missing integration web fixture. Run: mise run build:integration-web");
    process.exitCode = 1;
    return;
  }

  const timeoutSeconds = Number(process.env.TIMEOUT_SECONDS || "60");
  const logFile = prepareLogFile(testName);
  const godotCommand = process.env.GODOT || "godot";
  const importLogStream = await openLogStream(logFile);
  let importError: unknown;

  try {
    await execa(
      godotCommand,
      ["--headless", "--editor", "--quit", "--path", integrationProjectDir],
      {
        cwd: rootDir,
        stderr: importLogStream,
        stdout: importLogStream,
      },
    );
  } catch (error) {
    importError = error;
  } finally {
    importLogStream.end();
  }

  if (importError) {
    await sleep(300);
    console.error(`Godot editor import failed before running ${testName}`);
    console.error(`=== Full log: ${logFile} ===`);
    console.error(readLogFile(logFile));
    console.error("=== End of log ===");
    throw importError;
  }

  const runtimeLogStream = await openLogStream(logFile);
  const godotProcess = execa(
    godotCommand,
    ["--headless", "--path", integrationProjectDir, "--", `--kirie-test=${testName}`],
    { cwd: rootDir, stderr: runtimeLogStream, stdout: runtimeLogStream },
  );
  const watchedGodotProcess = godotProcess.then(
    () => undefined,
    () => undefined,
  );
  let result: MarkerResult | undefined;

  try {
    result = await Promise.race([
      waitForMarker({ logFile, testName, timeoutSeconds }),
      watchedGodotProcess.then(
        (): MarkerResult => ({
          ...(findMarker({ logFile, testName }) || {
            line: `Godot exited before KIRIE_TEST_PASS/FAIL for ${testName}`,
            status: "stopped",
          }),
        }),
      ),
    ]);
  } finally {
    godotProcess.kill();
    await watchedGodotProcess;
    runtimeLogStream.end();
  }

  if (result) {
    await printIntegrationResult(result, logFile, testName, {
      earlyExitSubject: "Godot",
      settleMilliseconds: 300,
    });
  }
}
