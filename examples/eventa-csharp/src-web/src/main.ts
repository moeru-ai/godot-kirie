import { createContext } from "@gd-kirie/ipc-eventa";
import { defineEventa, defineInvoke, defineInvokeEventa, defineInvokeHandler } from "@moeru/eventa";

import "./style.css";

interface WebReadyPayload {
  userAgent: string;
}

interface EchoRequest {
  message: string;
}

interface EchoResponse {
  reply: string;
}

const logElement = document.querySelector<HTMLPreElement>("#log");
const invokeGodotButton = document.querySelector<HTMLButtonElement>("#invokeGodotButton");
if (!logElement || !invokeGodotButton) {
  throw new Error("Missing Kirie Eventa example UI.");
}

const logNode = logElement;

const { context } = createContext();
const webReady = defineEventa<WebReadyPayload>("web:ready");
const godotEcho = defineInvokeEventa<EchoResponse, EchoRequest>("godot:echo");
const webEcho = defineInvokeEventa<EchoResponse, EchoRequest>("web:echo");
const invokeGodotEcho = defineInvoke(context, godotEcho);

function appendLog(line: string): void {
  logNode.textContent = `${logNode.textContent}\n${line}`;
  console.log(line);
}

defineInvokeHandler(context, webEcho, ({ message }) => {
  appendLog(`Received web:echo request: ${message}`);
  return {
    reply: `WebView received: ${message}`,
  };
});

invokeGodotButton.addEventListener("click", async () => {
  try {
    const response = await invokeGodotEcho({ message: "Hello from WebView" });
    appendLog(`godot:echo response: ${response.reply}`);
  } catch (error) {
    appendLog(error instanceof Error ? error.message : "godot:echo failed");
  }
});

context.emit(webReady, {
  userAgent: navigator.userAgent,
});
appendLog("Sent web:ready");
