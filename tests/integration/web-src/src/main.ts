import {
  type KirieData,
  onBinaryReceived,
  onDataReceived,
  onTextReceived,
  sendBinary,
  sendData,
  sendText,
} from "@gd-kirie/ipc";

const params = new URLSearchParams(globalThis.location.search);
const kirieProbeName = params.get("probe") ?? "res_asset_loading";
const kirieTestName = params.get("test") ?? "";

interface KirieDataRecord {
  [key: string]: KirieData;
}

function isRecord(value: KirieData): value is KirieDataRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: KirieDataRecord, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function sendProbeData(type: string, payload: KirieData): void {
  sendData({
    type,
    payload,
  });
}

onTextReceived((message) => {
  sendText(`web_text_echo:${message}`);
});

onBinaryReceived((bytes) => {
  sendBinary(bytes);
});

onDataReceived((message) => {
  if (!isRecord(message)) {
    sendProbeData("data_echo", message);
    return;
  }

  if (readString(message, "type") !== "godot_ready") {
    sendProbeData("data_echo", message);
    return;
  }

  const payload = message.payload;
  if (!isRecord(payload) || readString(payload, "probe") !== kirieProbeName) {
    return;
  }

  sendProbeData("web_ack", {
    acknowledgedType: "godot_ready",
    probe: kirieProbeName,
    test: readString(payload, "test"),
  });
});

globalThis.setTimeout(() => {
  sendProbeData("web_ready", {
    href: globalThis.location.href,
    probe: kirieProbeName,
    test: kirieTestName,
    userAgent: navigator.userAgent,
  });
}, 0);
