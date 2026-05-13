import Foundation

extension Notification.Name {
    static let kirieWebViewReady = Notification.Name("KirieWebViewReady")
    static let kirieTextPacketReceived = Notification.Name("KirieTextPacketReceived")
    static let kirieBinaryPacketReceived = Notification.Name("KirieBinaryPacketReceived")
    static let kirieDataPacketReceived = Notification.Name("KirieDataPacketReceived")
    static let kirieIpcError = Notification.Name("KirieIpcError")
}

enum KiriePacketChannel: String, CaseIterable {
    case text = "KirieTextChannel"
    case binary = "KirieBinaryChannel"
    case data = "KirieDataChannel"

    var logName: String {
        switch self {
        case .text:
            return "text"
        case .binary:
            return "binary"
        case .data:
            return "data"
        }
    }

    var notificationName: Notification.Name {
        switch self {
        case .text:
            return .kirieTextPacketReceived
        case .binary:
            return .kirieBinaryPacketReceived
        case .data:
            return .kirieDataPacketReceived
        }
    }
}
