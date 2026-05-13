import { decode, encode } from "cborg";

const READY_MESSAGE = new ArrayBuffer(0);
const ENCODE_OPTIONS = { float64: true } as const;

type KirieAndroidChannel = {
  postMessage(message: ArrayBuffer): void;
  onmessage: ((event: MessageEvent) => void) | null;
};

declare global {
  interface Window {
    KirieTextChannel?: KirieAndroidChannel;
    KirieBinaryChannel?: KirieAndroidChannel;
    KirieDataChannel?: KirieAndroidChannel;
  }
}

export type KirieData =
  | null
  | boolean
  | number
  | string
  | KirieData[]
  | { [key: string]: KirieData };

export type KirieMessageHandler<TMessage> = (message: TMessage) => void;

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

function listen<TMessage>(
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

export function sendText(message: string): void {
  const channel = window.KirieTextChannel;
  if (!channel) {
    throw new Error("Kirie Android channel is not available: KirieTextChannel");
  }

  channel.postMessage(asArrayBuffer(encode(message, ENCODE_OPTIONS)));
}

export function sendBinary(bytes: Uint8Array): void {
  const channel = window.KirieBinaryChannel;
  if (!channel) {
    throw new Error("Kirie Android channel is not available: KirieBinaryChannel");
  }

  channel.postMessage(asArrayBuffer(encode(bytes, ENCODE_OPTIONS)));
}

export function sendData(value: KirieData): void {
  const channel = window.KirieDataChannel;
  if (!channel) {
    throw new Error("Kirie Android channel is not available: KirieDataChannel");
  }

  channel.postMessage(asArrayBuffer(encode(value, ENCODE_OPTIONS)));
}

export function onTextReceived(handler: KirieMessageHandler<string>): () => void {
  const channel = window.KirieTextChannel;
  if (!channel) {
    throw new Error("Kirie Android channel is not available: KirieTextChannel");
  }

  return listen(channel, decodeText, handler);
}

export function onBinaryReceived(handler: KirieMessageHandler<Uint8Array>): () => void {
  const channel = window.KirieBinaryChannel;
  if (!channel) {
    throw new Error("Kirie Android channel is not available: KirieBinaryChannel");
  }

  return listen(channel, decodeBinary, handler);
}

export function onDataReceived(handler: KirieMessageHandler<KirieData>): () => void {
  const channel = window.KirieDataChannel;
  if (!channel) {
    throw new Error("Kirie Android channel is not available: KirieDataChannel");
  }

  return listen(channel, (value) => decode(asUint8Array(value)) as KirieData, handler);
}
