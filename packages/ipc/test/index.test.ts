import { strictEqual, throws } from "node:assert";
import { test } from "node:test";

import { decode, encode } from "cborg";

import {
  onBinaryReceived,
  onDataReceived,
  onTextReceived,
  sendBinary,
  sendData,
} from "../src/index.ts";

class TestChannel {
  readonly sent: ArrayBuffer[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;

  postMessage(message: ArrayBuffer): void {
    this.sent.push(message);
  }

  receive(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

function installWindow(channels: {
  text?: TestChannel;
  binary?: TestChannel;
  data?: TestChannel;
}): void {
  const testWindow = {
    KirieTextChannel: channels.text,
    KirieBinaryChannel: channels.binary,
    KirieDataChannel: channels.data,
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: testWindow,
  });
}

function sentBytes(channel: TestChannel, index: number): Uint8Array {
  const message = channel.sent[index];
  if (!message) {
    throw new Error(`Missing sent message at index ${index}.`);
  }

  return new Uint8Array(message);
}

function bytesFromHex(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }

  return bytes;
}

function captureReportedErrors(run: () => void): unknown[] {
  const reported: unknown[] = [];
  const originalReportError = globalThis.reportError;
  globalThis.reportError = (error: unknown): void => {
    reported.push(error);
  };

  try {
    run();
  } finally {
    globalThis.reportError = originalReportError;
  }

  return reported;
}

test("sendBinary posts a CBOR byte string for only the selected Uint8Array range", () => {
  const binaryChannel = new TestChannel();
  installWindow({ binary: binaryChannel });

  const source = new Uint8Array([0, 75, 105, 114, 105, 101, 0]);
  sendBinary(source.subarray(1, 6));

  const decoded = decode(sentBytes(binaryChannel, 0));
  strictEqual(decoded instanceof Uint8Array, true);
  strictEqual(new TextDecoder().decode(decoded as Uint8Array), "Kirie");
});

test("sendData keeps fractional numbers encoded as float64", () => {
  const dataChannel = new TestChannel();
  installWindow({ data: dataChannel });

  sendData(1.5);

  strictEqual(sentBytes(dataChannel, 0)[0], 0xfb);
});

test("sendData rejects bytes inside data payloads", () => {
  const dataChannel = new TestChannel();
  installWindow({ data: dataChannel });

  throws(() => sendData({ payload: new Uint8Array([1]) } as never), /must not contain bytes/);
  strictEqual(dataChannel.sent.length, 0);
});

test("sendData rejects unsafe integers before encoding", () => {
  const dataChannel = new TestChannel();
  installWindow({ data: dataChannel });

  throws(() => sendData(Number.MAX_SAFE_INTEGER + 1), /safe integer/);
  throws(() => sendData({ value: Number.MIN_SAFE_INTEGER - 1 }), /safe integer/);
  strictEqual(dataChannel.sent.length, 0);
});

test("sendData rejects non-finite numbers before encoding", () => {
  const dataChannel = new TestChannel();
  installWindow({ data: dataChannel });

  throws(() => sendData(Number.NaN), /numbers must be finite/);
  throws(() => sendData(Number.POSITIVE_INFINITY), /numbers must be finite/);
  strictEqual(dataChannel.sent.length, 0);
});

test("sendData rejects overly deep data before encoding", () => {
  const dataChannel = new TestChannel();
  installWindow({ data: dataChannel });

  let value: unknown = null;
  for (let depth = 0; depth < 65; depth += 1) {
    value = [value];
  }

  throws(() => sendData(value as never), /nesting is too deep/);
  strictEqual(dataChannel.sent.length, 0);
});

test("listeners fan out through one native callback and unsubscribe independently", () => {
  const textChannel = new TestChannel();
  installWindow({ text: textChannel });

  const received: string[] = [];
  let unsubscribeLate: (() => void) | undefined;
  const unsubscribeFirst = onTextReceived((message) => {
    received.push(`first:${message}`);
    unsubscribeLate ??= onTextReceived((lateMessage) => {
      received.push(`late:${lateMessage}`);
    });
  });
  const unsubscribeSecond = onTextReceived((message) => {
    received.push(`second:${message}`);
  });

  strictEqual(textChannel.sent.length, 1);
  textChannel.receive(encode("hello"));
  strictEqual(received.join(","), "first:hello,second:hello");

  unsubscribeFirst();
  textChannel.receive(encode("again"));
  strictEqual(received.join(","), "first:hello,second:hello,second:again,late:again");

  unsubscribeSecond();
  unsubscribeLate?.();
  strictEqual(textChannel.onmessage, null);
});

test("one failing listener does not block later listeners", () => {
  const textChannel = new TestChannel();
  installWindow({ text: textChannel });

  const reported = captureReportedErrors(() => {
    const received: string[] = [];
    onTextReceived(() => {
      throw new Error("listener failed");
    });
    onTextReceived((message) => {
      received.push(message);
    });

    textChannel.receive(encode("hello"));
    strictEqual(received.join(","), "hello");
  });

  strictEqual(reported.length, 1);
});

test("text listeners reject invalid UTF-8 CBOR text", () => {
  const textChannel = new TestChannel();
  installWindow({ text: textChannel });

  const reported = captureReportedErrors(() => {
    let received = false;
    onTextReceived(() => {
      received = true;
    });

    textChannel.receive(bytesFromHex("61ff"));

    strictEqual(received, false);
  });

  strictEqual(reported.length, 1);
});

test("incoming CBOR can be decoded from ArrayBuffer views without reading unrelated bytes", () => {
  const dataChannel = new TestChannel();
  installWindow({ data: dataChannel });

  let received: unknown;
  onDataReceived((message) => {
    received = message;
  });

  const encoded = encode({ ok: true });
  const source = new Uint8Array(encoded.byteLength + 2);
  source[0] = 0xff;
  source.set(encoded, 1);
  source[source.byteLength - 1] = 0xff;

  dataChannel.receive(new DataView(source.buffer, 1, encoded.byteLength));

  strictEqual(JSON.stringify(received), '{"ok":true}');
});

test("data listeners reject nested CBOR byte strings", () => {
  const dataChannel = new TestChannel();
  installWindow({ data: dataChannel });

  const reported = captureReportedErrors(() => {
    let received = false;
    onDataReceived(() => {
      received = true;
    });

    dataChannel.receive(encode({ bytes: new Uint8Array([1]) }));

    strictEqual(received, false);
  });

  strictEqual(reported.length, 1);
});

test("data listeners reject duplicate maps, undefined, and indefinite arrays", () => {
  const dataChannel = new TestChannel();
  installWindow({ data: dataChannel });

  const reported = captureReportedErrors(() => {
    let receivedCount = 0;
    onDataReceived(() => {
      receivedCount += 1;
    });

    dataChannel.receive(bytesFromHex("a2616101616102"));
    dataChannel.receive(bytesFromHex("f7"));
    dataChannel.receive(bytesFromHex("9fff"));

    strictEqual(receivedCount, 0);
  });

  strictEqual(reported.length, 3);
});

test("data listeners reject invalid UTF-8 strings", () => {
  const dataChannel = new TestChannel();
  installWindow({ data: dataChannel });

  const reported = captureReportedErrors(() => {
    let received = false;
    onDataReceived(() => {
      received = true;
    });

    dataChannel.receive(bytesFromHex("a161ff01"));

    strictEqual(received, false);
  });

  strictEqual(reported.length, 1);
});

test("data listeners reject non-finite float encodings", () => {
  const dataChannel = new TestChannel();
  installWindow({ data: dataChannel });

  const reported = captureReportedErrors(() => {
    let receivedCount = 0;
    onDataReceived(() => {
      receivedCount += 1;
    });

    dataChannel.receive(bytesFromHex("f97c00"));
    dataChannel.receive(bytesFromHex("f97e00"));

    strictEqual(receivedCount, 0);
  });

  strictEqual(reported.length, 2);
});

test("data listeners reject overly deep CBOR arrays", () => {
  const dataChannel = new TestChannel();
  installWindow({ data: dataChannel });

  const reported = captureReportedErrors(() => {
    let received = false;
    onDataReceived(() => {
      received = true;
    });

    const packet = new Uint8Array(66);
    packet.fill(0x81, 0, 65);
    packet[65] = 0xf6;
    dataChannel.receive(packet);

    strictEqual(received, false);
  });

  strictEqual(reported.length, 1);
});

test("binary listeners receive decoded Uint8Array messages", () => {
  const binaryChannel = new TestChannel();
  installWindow({ binary: binaryChannel });

  let byteLength = 0;
  onBinaryReceived((bytes) => {
    byteLength = bytes.byteLength;
  });

  binaryChannel.receive(encode(new Uint8Array([1, 2, 3])));

  strictEqual(byteLength, 3);
});
