import { decode, encode } from "cborg";

const READY_MESSAGE = new ArrayBuffer(0);
const ENCODE_OPTIONS = { float64: true } as const;
const DECODE_OPTIONS = {
  allowIndefinite: false,
  allowInfinity: false,
  allowNaN: false,
  allowUndefined: false,
  rejectDuplicateMapKeys: true,
} as const;
const FATAL_UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const MAX_DEPTH = 64;

type KirieChannel = {
  postMessage(message: ArrayBuffer): void;
  onmessage: ((event: MessageEvent) => void) | null;
};

type KirieChannelListener = {
  read(value: unknown): unknown;
  handler(message: unknown): void;
};

type KirieChannelState = {
  nativeListener: (event: MessageEvent) => void;
  listeners: Set<KirieChannelListener>;
};

const channelStates = new WeakMap<KirieChannel, KirieChannelState>();

declare global {
  interface Window {
    KirieTextChannel?: KirieChannel;
    KirieBinaryChannel?: KirieChannel;
    KirieDataChannel?: KirieChannel;
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
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  throw new TypeError("Kirie message must be an ArrayBuffer or ArrayBuffer view.");
}

function readArgument(bytes: Uint8Array, additional: number, offset: number): [number, number] {
  if (additional < 24) {
    return [additional, offset];
  }

  const byteCount = additional === 24 ? 1 : additional === 25 ? 2 : additional === 26 ? 4 : 8;
  if (additional > 27) {
    throw new TypeError("Unsupported CBOR additional information.");
  }

  if (offset + byteCount > bytes.byteLength) {
    throw new TypeError("Unexpected end of CBOR data.");
  }

  let value = 0;
  for (let index = 0; index < byteCount; index += 1) {
    value = value * 256 + bytes[offset + index];
  }

  if (!Number.isSafeInteger(value)) {
    throw new TypeError("CBOR length is too large.");
  }

  return [value, offset + byteCount];
}

function validateUtf8TextItems(bytes: Uint8Array, offset: number, depth: number): number {
  if (depth > MAX_DEPTH) {
    throw new TypeError("Kirie CBOR nesting is too deep.");
  }

  if (offset >= bytes.byteLength) {
    throw new TypeError("Unexpected end of CBOR data.");
  }

  const initial = bytes[offset];
  const major = initial >> 5;
  const additional = initial & 0x1f;
  let nextOffset = offset + 1;

  if (major === 0 || major === 1) {
    return readArgument(bytes, additional, nextOffset)[1];
  }

  if (major === 2 || major === 3) {
    const [length, payloadOffset] = readArgument(bytes, additional, nextOffset);
    const endOffset = payloadOffset + length;
    if (endOffset > bytes.byteLength) {
      throw new TypeError("Unexpected end of CBOR data.");
    }

    if (major === 3) {
      try {
        FATAL_UTF8_DECODER.decode(bytes.subarray(payloadOffset, endOffset));
      } catch {
        throw new TypeError("Invalid CBOR UTF-8 text.");
      }
    }

    return endOffset;
  }

  if (major === 4) {
    const [count, payloadOffset] = readArgument(bytes, additional, nextOffset);
    nextOffset = payloadOffset;
    if (count > bytes.byteLength - nextOffset) {
      throw new TypeError("Unexpected end of CBOR data.");
    }

    for (let index = 0; index < count; index += 1) {
      nextOffset = validateUtf8TextItems(bytes, nextOffset, depth + 1);
    }
    return nextOffset;
  }

  if (major === 5) {
    const [count, payloadOffset] = readArgument(bytes, additional, nextOffset);
    nextOffset = payloadOffset;
    if (count > (bytes.byteLength - nextOffset) / 2) {
      throw new TypeError("Unexpected end of CBOR data.");
    }

    for (let index = 0; index < count * 2; index += 1) {
      nextOffset = validateUtf8TextItems(bytes, nextOffset, depth + 1);
    }
    return nextOffset;
  }

  if (major === 7) {
    return readArgument(bytes, additional, nextOffset)[1];
  }

  throw new TypeError("Unsupported CBOR major type.");
}

function assertValidCborText(bytes: Uint8Array): void {
  const offset = validateUtf8TextItems(bytes, 0, 0);
  if (offset !== bytes.byteLength) {
    throw new TypeError("CBOR packet has trailing bytes.");
  }
}

function decodeText(value: unknown): string {
  const bytes = asUint8Array(value);
  assertValidCborText(bytes);
  const decoded = decode(bytes, DECODE_OPTIONS);
  if (typeof decoded !== "string") {
    throw new TypeError("Kirie text message must decode to a string.");
  }

  return decoded;
}

function decodeBinary(value: unknown): Uint8Array {
  const decoded = decode(asUint8Array(value), DECODE_OPTIONS);
  if (decoded instanceof Uint8Array) {
    return decoded;
  }

  throw new TypeError("Kirie binary message must decode to bytes.");
}

function assertKirieData(value: unknown, depth = 0): asserts value is KirieData {
  if (depth > MAX_DEPTH) {
    throw new TypeError("Kirie CBOR nesting is too deep.");
  }

  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Kirie data numbers must be finite.");
    }

    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new TypeError("Kirie data integers must fit the JavaScript safe integer range.");
    }

    return;
  }

  if (value instanceof Uint8Array || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    throw new TypeError("Kirie data messages must not contain bytes; use the binary lane.");
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      assertKirieData(item, depth + 1);
    }
    return;
  }

  if (typeof value !== "object") {
    throw new TypeError(`Unsupported Kirie data value: ${typeof value}.`);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Kirie data objects must be plain string-key maps.");
  }

  for (const item of Object.values(value)) {
    assertKirieData(item, depth + 1);
  }
}

function decodeData(value: unknown): KirieData {
  const bytes = asUint8Array(value);
  assertValidCborText(bytes);
  const decoded = decode(bytes, DECODE_OPTIONS);
  assertKirieData(decoded);
  return decoded;
}

function listen<TMessage>(
  channel: KirieChannel,
  read: (value: unknown) => TMessage,
  handler: KirieMessageHandler<TMessage>,
): () => void {
  const listener: KirieChannelListener = {
    read,
    handler: handler as KirieMessageHandler<unknown>,
  };
  let state = channelStates.get(channel);

  if (!state) {
    state = {
      listeners: new Set(),
      nativeListener: (event: MessageEvent) => {
        const currentState = channelStates.get(channel);
        if (!currentState) {
          return;
        }

        for (const currentListener of [...currentState.listeners]) {
          if (!currentState.listeners.has(currentListener)) {
            continue;
          }

          try {
            currentListener.handler(currentListener.read(event.data));
          } catch (error) {
            if (typeof globalThis.reportError === "function") {
              globalThis.reportError(error);
            } else {
              console.error(error);
            }
          }
        }
      },
    };
    channelStates.set(channel, state);
    channel.onmessage = state.nativeListener;
    channel.postMessage(READY_MESSAGE);
  }

  state.listeners.add(listener);

  return () => {
    const currentState = channelStates.get(channel);
    if (!currentState) {
      return;
    }

    currentState.listeners.delete(listener);
    if (currentState.listeners.size > 0) {
      return;
    }

    channelStates.delete(channel);
    if (channel.onmessage === currentState.nativeListener) {
      channel.onmessage = null;
    }
  };
}

export function sendText(message: string): void {
  const channel = window.KirieTextChannel;
  if (!channel) {
    throw new Error("Kirie channel is not available: KirieTextChannel");
  }

  channel.postMessage(asArrayBuffer(encode(message, ENCODE_OPTIONS)));
}

export function sendBinary(bytes: Uint8Array): void {
  const channel = window.KirieBinaryChannel;
  if (!channel) {
    throw new Error("Kirie channel is not available: KirieBinaryChannel");
  }

  channel.postMessage(asArrayBuffer(encode(bytes, ENCODE_OPTIONS)));
}

export function sendData(value: KirieData): void {
  const channel = window.KirieDataChannel;
  if (!channel) {
    throw new Error("Kirie channel is not available: KirieDataChannel");
  }

  assertKirieData(value);
  channel.postMessage(asArrayBuffer(encode(value, ENCODE_OPTIONS)));
}

export function onTextReceived(handler: KirieMessageHandler<string>): () => void {
  const channel = window.KirieTextChannel;
  if (!channel) {
    throw new Error("Kirie channel is not available: KirieTextChannel");
  }

  return listen(channel, decodeText, handler);
}

export function onBinaryReceived(handler: KirieMessageHandler<Uint8Array>): () => void {
  const channel = window.KirieBinaryChannel;
  if (!channel) {
    throw new Error("Kirie channel is not available: KirieBinaryChannel");
  }

  return listen(channel, decodeBinary, handler);
}

export function onDataReceived(handler: KirieMessageHandler<KirieData>): () => void {
  const channel = window.KirieDataChannel;
  if (!channel) {
    throw new Error("Kirie channel is not available: KirieDataChannel");
  }

  return listen(channel, decodeData, handler);
}
