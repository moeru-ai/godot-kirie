import Foundation
import WebKit

final class KirieScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var manager: KirieManager?

    init(manager: KirieManager) {
        self.manager = manager
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let name = message.name
        let body = message.body
        let bodyType = type(of: body)

        Task { @MainActor [weak manager] in
            manager?.logInfo("Received WKScriptMessage name=\(name) bodyType=\(bodyType)")
        }

        if let channel = KiriePacketChannel(rawValue: message.name) {
            handlePacketMessage(message, channel: channel)
            return
        }

        emitIpcError("Received message from unknown JavaScript channel: \(message.name)")
    }

    private func handlePacketMessage(_ message: WKScriptMessage, channel: KiriePacketChannel) {
        guard let packetBase64 = message.body as? String else {
            emitIpcError("Received non-string \(channel.logName) packet from JavaScript")
            return
        }

        guard let packet = Data(base64Encoded: packetBase64) else {
            emitIpcError("Received invalid base64 \(channel.logName) packet from JavaScript")
            return
        }

        if packet.isEmpty {
            logInfo("Ignoring empty \(channel.logName) packet readiness message")
            return
        }

        emitPacket(packet, channel: channel)
    }

    private func emitPacket(_ packet: Data, channel: KiriePacketChannel) {
        Task { @MainActor [weak manager] in
            manager?.emitPacket(packet, channel: channel)
        }
    }

    private func emitIpcError(_ message: String) {
        Task { @MainActor [weak manager] in
            manager?.emitIpcError(message)
        }
    }

    private func logInfo(_ message: String) {
        Task { @MainActor [weak manager] in
            manager?.logInfo(message)
        }
    }
}
