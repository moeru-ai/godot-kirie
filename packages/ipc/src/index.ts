import { decode, encode } from "cborg";

const READY_MESSAGE = new ArrayBuffer(0);
const ENCODE_OPTIONS = { float64: true } as const;

export type KiriePlatformOs = "android" | "ios" | "macos" | "windows" | "linux";
export type KiriePlatformBackend = "webview" | "wkwebview" | "godot-cef";

export interface KiriePlatform {
  os: KiriePlatformOs;
  backend: KiriePlatformBackend;
}

export interface KirieRuntime {
  platform: KiriePlatform;
}

interface KirieAndroidChannel {
  postMessage(message: ArrayBuffer): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

interface KirieIosMessageHandler {
  postMessage(message: string): void;
}

interface KirieIosWebkit {
  messageHandlers?: {
    kirie?: KirieIosMessageHandler;
  };
}

declare global {
  interface Window {
    kirie?: KirieRuntime;
    KirieTextChannel?: KirieAndroidChannel;
    KirieBinaryChannel?: KirieAndroidChannel;
    KirieDataChannel?: KirieAndroidChannel;
    webkit?: KirieIosWebkit;
  }
}

/**
 * Structured data lane subset shared with Godot Variant data.
 * It intentionally excludes engine-local and JavaScript-local object types.
 */
export type KirieData =
  | null
  | boolean
  | number
  | string
  | KirieData[]
  | { [key: string]: KirieData };

export type KirieMessageHandler<TMessage> = (message: TMessage) => void;

interface KirieTransport {
  sendText(message: string): void;
  sendBinary(bytes: Uint8Array): void;
  sendData(value: KirieData): void;
  onTextReceived(handler: KirieMessageHandler<string>): () => void;
  onBinaryReceived(handler: KirieMessageHandler<Uint8Array>): () => void;
  onDataReceived(handler: KirieMessageHandler<KirieData>): () => void;
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
  ) {
    return bytes.buffer;
  }

  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

function asUint8Array(value: unknown): Uint8Array {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  throw new TypeError("Kirie message must be an ArrayBuffer.");
}

function decodeText(value: unknown): string {
  const decoded = decode(asUint8Array(value));
  if (typeof decoded !== "string") {
    throw new TypeError("Kirie text message must decode to a string.");
  }

  return decoded;
}

function decodeBinary(value: unknown): Uint8Array {
  const decoded = decode(asUint8Array(value));
  if (decoded instanceof Uint8Array) {
    return decoded;
  }

  throw new TypeError("Kirie binary message must decode to bytes.");
}

function currentTransport(): KirieTransport {
  const platform = window.kirie?.platform;
  return transports[`${platform?.os}/${platform?.backend}`];
}

function listenAndroid<TMessage>(
  channel: KirieAndroidChannel,
  read: (value: unknown) => TMessage,
  handler: KirieMessageHandler<TMessage>,
): () => void {
  const listener = (event: MessageEvent) => {
    handler(read(event.data));
  };

  channel.onmessage = listener;
  channel.postMessage(READY_MESSAGE);

  return () => {
    if (channel.onmessage === listener) {
      channel.onmessage = null;
    }
  };
}

function requireAndroidChannel(
  name: "KirieTextChannel" | "KirieBinaryChannel" | "KirieDataChannel",
): KirieAndroidChannel {
  const channel = window[name];
  if (!channel) {
    throw new Error(`Kirie Android channel is not available: ${name}`);
  }

  return channel;
}

const androidTransport: KirieTransport = {
  sendText(message) {
    requireAndroidChannel("KirieTextChannel").postMessage(
      asArrayBuffer(encode(message, ENCODE_OPTIONS)),
    );
  },

  sendBinary(bytes) {
    requireAndroidChannel("KirieBinaryChannel").postMessage(
      asArrayBuffer(encode(bytes, ENCODE_OPTIONS)),
    );
  },

  sendData(value) {
    requireAndroidChannel("KirieDataChannel").postMessage(
      asArrayBuffer(encode(value, ENCODE_OPTIONS)),
    );
  },

  onTextReceived(handler) {
    return listenAndroid(requireAndroidChannel("KirieTextChannel"), decodeText, handler);
  },

  onBinaryReceived(handler) {
    return listenAndroid(requireAndroidChannel("KirieBinaryChannel"), decodeBinary, handler);
  },

  onDataReceived(handler) {
    return listenAndroid(
      requireAndroidChannel("KirieDataChannel"),
      (value) => decode(asUint8Array(value)) as KirieData,
      handler,
    );
  },
};

function requireIosMessageHandler(): KirieIosMessageHandler {
  const handler = window.webkit?.messageHandlers?.kirie;
  if (!handler) {
    throw new Error(
      "Kirie iOS message handler is not available: window.webkit.messageHandlers.kirie",
    );
  }

  return handler;
}

const iosTransport: KirieTransport = {
  sendText(message) {
    requireIosMessageHandler().postMessage(message);
  },

  sendBinary() {
    throw new Error("Kirie iOS binary lane is not available yet.");
  },

  sendData() {
    throw new Error("Kirie iOS data lane is not available yet.");
  },

  onTextReceived(handler) {
    const listener = (event: Event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== "string") {
        return;
      }

      handler(event.detail);
    };

    window.addEventListener("kirie:ipc-message", listener);
    return () => window.removeEventListener("kirie:ipc-message", listener);
  },

  onBinaryReceived() {
    throw new Error("Kirie iOS binary lane is not available yet.");
  },

  onDataReceived() {
    throw new Error("Kirie iOS data lane is not available yet.");
  },
};

const transports: Record<string, KirieTransport> = {
  "android/webview": androidTransport,
  "ios/wkwebview": iosTransport,
};

export function sendText(message: string): void {
  currentTransport().sendText(message);
}

export function sendBinary(bytes: Uint8Array): void {
  currentTransport().sendBinary(bytes);
}

export function sendData(value: KirieData): void {
  currentTransport().sendData(value);
}

export function onTextReceived(handler: KirieMessageHandler<string>): () => void {
  return currentTransport().onTextReceived(handler);
}

export function onBinaryReceived(handler: KirieMessageHandler<Uint8Array>): () => void {
  return currentTransport().onBinaryReceived(handler);
}

export function onDataReceived(handler: KirieMessageHandler<KirieData>): () => void {
  return currentTransport().onDataReceived(handler);
}
