extension KirieManager {
    static let packetChannelScript = """
    (() => {
      const channelNames = ["KirieTextChannel", "KirieBinaryChannel", "KirieDataChannel"];

      function asUint8Array(value) {
        if (value instanceof ArrayBuffer) {
          return new Uint8Array(value);
        }

        if (ArrayBuffer.isView(value)) {
          return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        }

        throw new TypeError("Kirie packet must be an ArrayBuffer or ArrayBuffer view.");
      }

      function bytesToBase64(value) {
        const bytes = asUint8Array(value);
        let binary = "";
        const chunkSize = 0x8000;
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
        }
        return btoa(binary);
      }

      function base64ToArrayBuffer(value) {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        return bytes.buffer;
      }

      function installChannel(name) {
        const existing = window[name];
        if (existing?.__kirieIOSChannel === true) {
          return;
        }

        const channel = {
          __kirieIOSChannel: true,
          onmessage: null,
          postMessage(message) {
            window.webkit.messageHandlers[name].postMessage(bytesToBase64(message));
          },
          __kirieReceiveBase64(message) {
            if (typeof channel.onmessage !== "function") {
              return;
            }

            channel.onmessage.call(channel, new MessageEvent("message", {
              data: base64ToArrayBuffer(message),
            }));
          },
        };

        Object.defineProperty(window, name, {
          configurable: true,
          enumerable: false,
          value: channel,
        });
      }

      channelNames.forEach(installChannel);
    })();
    """
}
