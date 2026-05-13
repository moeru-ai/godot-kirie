import Dispatch
import Foundation

@_cdecl("kirie_swift_init")
public func kirie_swift_init() {
    kirieLogEntry("kirie_swift_init")
    DispatchQueue.main.async {
        _ = KirieManager.shared
    }
}

@_cdecl("kirie_swift_deinit")
public func kirie_swift_deinit() {
    kirieLogEntry("kirie_swift_deinit")
    DispatchQueue.main.async {
        KirieManager.shared.destroyWebView()
    }
}

@_cdecl("kirie_swift_create_webview")
public func kirie_swift_create_webview(_ initialURLPointer: UnsafePointer<CChar>?) {
    let initialURL = initialURLPointer.map { String(cString: $0) }
    kirieLogEntry("kirie_swift_create_webview initialURL=\(initialURL ?? "<nil>")")
    DispatchQueue.main.async {
        KirieManager.shared.createWebView(initialURL: initialURL?.isEmpty == true ? nil : initialURL)
    }
}

@_cdecl("kirie_swift_destroy_webview")
public func kirie_swift_destroy_webview() {
    kirieLogEntry("kirie_swift_destroy_webview")
    DispatchQueue.main.async {
        KirieManager.shared.destroyWebView()
    }
}

@_cdecl("kirie_swift_load_url")
public func kirie_swift_load_url(_ urlPointer: UnsafePointer<CChar>?) {
    guard let urlPointer else {
        kirieLogEntry("kirie_swift_load_url ignored nil pointer")
        return
    }

    let url = String(cString: urlPointer)
    kirieLogEntry("kirie_swift_load_url url=\(url)")
    DispatchQueue.main.async {
        KirieManager.shared.loadURL(url)
    }
}

@_cdecl("kirie_swift_load_html_string")
public func kirie_swift_load_html_string(_ htmlPointer: UnsafePointer<CChar>?, _ baseURLPointer: UnsafePointer<CChar>?) {
    guard let htmlPointer else {
        kirieLogEntry("kirie_swift_load_html_string ignored nil html pointer")
        return
    }

    let html = String(cString: htmlPointer)
    let baseURL = baseURLPointer.map { String(cString: $0) }
    kirieLogEntry("kirie_swift_load_html_string bytes=\(html.utf8.count) baseURL=\(baseURL ?? "<nil>")")

    DispatchQueue.main.async {
        KirieManager.shared.loadHTMLString(html, baseURLString: baseURL?.isEmpty == true ? nil : baseURL)
    }
}

@_cdecl("kirie_swift_send_text_packet")
public func kirie_swift_send_text_packet(_ packetPointer: UnsafePointer<UInt8>?, _ packetLength: Int32) {
    sendPacket(packetPointer, packetLength, logName: "text") { packet in
        KirieManager.shared.sendTextPacket(packet)
    }
}

@_cdecl("kirie_swift_send_binary_packet")
public func kirie_swift_send_binary_packet(_ packetPointer: UnsafePointer<UInt8>?, _ packetLength: Int32) {
    sendPacket(packetPointer, packetLength, logName: "binary") { packet in
        KirieManager.shared.sendBinaryPacket(packet)
    }
}

@_cdecl("kirie_swift_send_data_packet")
public func kirie_swift_send_data_packet(_ packetPointer: UnsafePointer<UInt8>?, _ packetLength: Int32) {
    sendPacket(packetPointer, packetLength, logName: "data") { packet in
        KirieManager.shared.sendDataPacket(packet)
    }
}

private func sendPacket(
    _ packetPointer: UnsafePointer<UInt8>?,
    _ packetLength: Int32,
    logName: String,
    send: @MainActor @escaping (Data) -> Void
) {
    guard packetLength >= 0 else {
        kirieLogEntry("kirie_swift_send_\(logName)_packet ignored negative length")
        return
    }

    if packetLength == 0 {
        kirieLogEntry("kirie_swift_send_\(logName)_packet bytes=0")
        DispatchQueue.main.async {
            send(Data())
        }
        return
    }

    guard let packetPointer else {
        kirieLogEntry("kirie_swift_send_\(logName)_packet ignored nil pointer")
        return
    }

    let packet = Data(bytes: packetPointer, count: Int(packetLength))
    kirieLogEntry("kirie_swift_send_\(logName)_packet bytes=\(packet.count)")
    DispatchQueue.main.async {
        send(packet)
    }
}

private func kirieLogEntry(_ message: String) {
    NSLog("[Kirie][entry] %@", message)
}
