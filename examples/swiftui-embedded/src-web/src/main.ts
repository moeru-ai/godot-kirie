import { createContext } from "@gd-kirie/ipc-eventa";
import {
  defineEventa,
  defineInvoke,
  defineInvokeEventa,
  defineInvokeHandler,
  type Eventa,
} from "@moeru/eventa";

interface WebReadyPayload {
  platform: string;
}

interface VerificationPayload {
  reply: string;
}

interface StatusPayload {
  message: string;
}

interface EchoRequest {
  message: string;
}

interface EchoResponse {
  reply: string;
}

const statusElement = document.querySelector<HTMLParagraphElement>("#status");
const logElement = document.querySelector<HTMLPreElement>("#log");
const invokeButton = document.querySelector<HTMLButtonElement>("#invokeGodotButton");
if (!statusElement || !logElement || !invokeButton) {
  throw new Error("Missing embedded Kirie UI");
}

const statusNode = statusElement;
const logNode = logElement;
const { context } = createContext();
const webReady = defineEventa<WebReadyPayload>("web:ready");
const webVerification = defineEventa<VerificationPayload>("web:verification");
const webStatusReceived = defineEventa<StatusPayload>("web:status-received");
const godotStatus = defineEventa<StatusPayload>("godot:status");
const godotEcho = defineInvokeEventa<EchoResponse, EchoRequest>("godot:echo");
const webEcho = defineInvokeEventa<EchoResponse, EchoRequest>("web:echo");
const invokeGodotEcho = defineInvoke(context, godotEcho);

function appendLog(line: string): void {
  logNode.textContent = `${logNode.textContent}\n${line}`;
  console.log(line);
}

async function verifyGodotInvoke(message: string): Promise<void> {
  try {
    const response = await invokeGodotEcho({ message });
    appendLog(`godot:echo → ${response.reply}`);
    context.emit(webVerification, { reply: response.reply });
  } catch (error) {
    appendLog(error instanceof Error ? error.message : "godot:echo failed");
  }
}

/**
 * Applies the status event emitted by the embedded Godot C# scene.
 *
 * Triggering workflow:
 *
 * {@link godotStatus}
 *   -> {@link context}
 *     -> `godot:status`
 *       -> {@link onGodotStatus}
 *
 * Upstream:
 * - {@link context}
 *
 * Downstream:
 * - {@link appendLog}
 */
function onGodotStatus({ body }: Eventa<StatusPayload>): void {
  if (!body) {
    return;
  }

  statusNode.textContent = body.message;
  appendLog(`godot:status → ${body.message}`);
  context.emit(webStatusReceived, { message: body.message });
}

/**
 * Handles the unary Eventa request sent from Godot to the WebView.
 *
 * Triggering workflow:
 *
 * {@link webEcho}
 *   -> {@link defineInvokeHandler}
 *     -> `web:echo`
 *       -> {@link handleWebEcho}
 *
 * Upstream:
 * - {@link context}
 *
 * Downstream:
 * - {@link appendLog}
 */
function handleWebEcho({ message }: EchoRequest): EchoResponse {
  appendLog(`web:echo ← ${message}`);
  return { reply: `WebView received: ${message}` };
}

/**
 * Starts a user-requested WebView-to-Godot invoke.
 *
 * Triggering workflow:
 *
 * {@link invokeButton}
 *   -> `click`
 *     -> {@link onInvokeGodotButton}
 *
 * Upstream:
 * - {@link invokeButton}
 *
 * Downstream:
 * - {@link verifyGodotInvoke}
 */
function onInvokeGodotButton(): void {
  verifyGodotInvoke("Hello from the WebView button").catch((error: unknown) => {
    appendLog(error instanceof Error ? error.message : "godot:echo failed");
  });
}

context.on(godotStatus, onGodotStatus);
defineInvokeHandler(context, webEcho, handleWebEcho);

invokeButton.addEventListener("click", onInvokeGodotButton);

context.emit(webReady, { platform: window.kirie?.platform?.backend ?? "wkwebview" });
appendLog("web:ready emitted");
await verifyGodotInvoke("Hello from embedded WebView");
