import {
  onBinaryReceived,
  onDataReceived,
  onTextReceived,
  sendBinary,
  sendData,
  sendText,
} from "@gd-kirie/ipc";

const params = new URLSearchParams(globalThis.location.search);
const kirieProbeName = params.get("probe") ?? "res_asset_loading";

onTextReceived((message) => {
  if (message === `godot_ready:${kirieProbeName}`) {
    sendText(`web_ack:${kirieProbeName}`);
    return;
  }

  sendText(`web_text_echo:${message}`);
});

onBinaryReceived((bytes) => {
  sendBinary(bytes);
});

onDataReceived(sendData);

globalThis.setTimeout(() => {
  sendText(`web_ready:${kirieProbeName}`);
}, 0);
