import {
  onBinaryReceived,
  onDataReceived,
  onTextReceived,
  sendBinary,
  sendData,
  sendText,
} from "@gd-kirie/ipc";

import "./style.css";

type KirieExampleMode = "manual" | "probe";

const logNodeElement = document.querySelector<HTMLPreElement>("#log");
const sendButtonElement = document.querySelector<HTMLButtonElement>("#sendButton");
if (!logNodeElement || !sendButtonElement) {
  throw new Error("Missing Kirie example UI.");
}

const logNode = logNodeElement;
const sendButton = sendButtonElement;
const mode = resolveMode();

function resolveMode(): KirieExampleMode {
  const queryMode = new URLSearchParams(globalThis.location.search).get("mode");
  if (queryMode === "probe") {
    return "probe";
  }

  return "manual";
}

function appendLog(line: string): void {
  logNode.textContent = `${logNode.textContent}\n${line}`;
  console.log(line);
}

function postTextToGodot(message: string): void {
  try {
    sendText(message);
    appendLog(`Sent text to Godot: ${message}`);
  } catch (error) {
    appendLog(error instanceof Error ? error.message : "Kirie native bridge is unavailable");
  }
}

onTextReceived((message) => {
  appendLog(`Received text from Godot: ${message}`);

  if (mode === "probe" && message === "godot_ready") {
    postTextToGodot("web_ack");
  }
});

onBinaryReceived((bytes) => {
  appendLog(`Received binary from Godot: ${bytes.byteLength} bytes`);
});

onDataReceived((data) => {
  appendLog(`Received data from Godot: ${JSON.stringify(data)}`);
});

sendButton.addEventListener("click", () => {
  postTextToGodot("web_ping");
  sendBinary(new Uint8Array([75, 105, 114, 105, 101]));
  sendData({ source: "web", mode });
});

appendLog(`Mode: ${mode}`);

postTextToGodot("web_ready");
sendData({ source: mode, userAgent: navigator.userAgent });
