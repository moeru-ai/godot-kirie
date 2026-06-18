import { onTextReceived, sendText } from "@gd-kirie/ipc";

import "./style.css";

type KirieExampleMode = "manual" | "probe";

type WebToGodotMessage =
  | {
      type: "web_ready";
      payload: {
        source: KirieExampleMode;
        userAgent: string;
      };
    }
  | {
      type: "web_ack";
      payload: {
        source: "probe";
        acknowledgedType: string;
      };
    }
  | {
      type: "web_ping";
      payload: {
        source: "web";
      };
    };

interface GodotToWebMessage {
  type?: string;
  payload?: unknown;
}

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

function postToGodot(message: WebToGodotMessage): void {
  const messageText = JSON.stringify(message);

  try {
    sendText(messageText);
    appendLog(`Sent text to Godot: ${messageText}`);
  } catch (error) {
    appendLog(error instanceof Error ? error.message : "Kirie native bridge is unavailable");
  }
}

onTextReceived((messageText) => {
  appendLog(`Received text from Godot: ${messageText}`);

  const message = JSON.parse(messageText) as GodotToWebMessage;

  if (mode === "probe" && message.type === "godot_ready") {
    postToGodot({
      type: "web_ack",
      payload: {
        source: "probe",
        acknowledgedType: message.type,
      },
    });
  }
});

sendButton.addEventListener("click", () => {
  postToGodot({
    type: "web_ping",
    payload: {
      source: "web",
    },
  });
});

appendLog(`Mode: ${mode}`);

postToGodot({
  type: "web_ready",
  payload: {
    source: mode,
    userAgent: navigator.userAgent,
  },
});
