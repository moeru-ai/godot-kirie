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
        KirieManager.shared.destroyAllWebViews()
    }
}

@_cdecl("kirie_swift_create_webview")
public func kirie_swift_create_webview(_ viewID: Int64, _ initialURLPointer: UnsafePointer<CChar>?) {
    let initialURL = initialURLPointer.map { String(cString: $0) }
    kirieLogEntry("kirie_swift_create_webview viewID=\(viewID) initialURL=\(initialURL ?? "<nil>")")
    DispatchQueue.main.async {
        KirieManager.shared.createWebView(viewID: viewID, initialURL: initialURL?.isEmpty == true ? nil : initialURL)
    }
}

@_cdecl("kirie_swift_destroy_webview")
public func kirie_swift_destroy_webview(_ viewID: Int64) {
    kirieLogEntry("kirie_swift_destroy_webview viewID=\(viewID)")
    DispatchQueue.main.async {
        KirieManager.shared.destroyWebView(viewID: viewID)
    }
}

@_cdecl("kirie_swift_load_url")
public func kirie_swift_load_url(_ viewID: Int64, _ urlPointer: UnsafePointer<CChar>?) {
    guard let urlPointer else {
        kirieLogEntry("kirie_swift_load_url ignored nil pointer")
        return
    }

    let url = String(cString: urlPointer)
    kirieLogEntry("kirie_swift_load_url viewID=\(viewID) url=\(url)")
    DispatchQueue.main.async {
        KirieManager.shared.loadURL(url, viewID: viewID)
    }
}

@_cdecl("kirie_swift_load_html_string")
public func kirie_swift_load_html_string(
    _ viewID: Int64,
    _ htmlPointer: UnsafePointer<CChar>?,
    _ baseURLPointer: UnsafePointer<CChar>?
) {
    guard let htmlPointer else {
        kirieLogEntry("kirie_swift_load_html_string ignored nil html pointer")
        return
    }

    let html = String(cString: htmlPointer)
    let baseURL = baseURLPointer.map { String(cString: $0) }
    kirieLogEntry(
        "kirie_swift_load_html_string viewID=\(viewID) bytes=\(html.utf8.count) baseURL=\(baseURL ?? "<nil>")"
    )

    DispatchQueue.main.async {
        KirieManager.shared.loadHTMLString(
            html,
            baseURLString: baseURL?.isEmpty == true ? nil : baseURL,
            viewID: viewID
        )
    }
}

@_cdecl("kirie_swift_send_ipc_message")
public func kirie_swift_send_ipc_message(_ viewID: Int64, _ messageJSONPointer: UnsafePointer<CChar>?) {
    guard let messageJSONPointer else {
        kirieLogEntry("kirie_swift_send_ipc_message ignored nil pointer")
        return
    }

    let messageJSON = String(cString: messageJSONPointer)
    kirieLogEntry("kirie_swift_send_ipc_message viewID=\(viewID) message=\(messageJSON)")
    DispatchQueue.main.async {
        KirieManager.shared.sendIpcMessage(messageJSON, viewID: viewID)
    }
}

@_cdecl("kirie_swift_send_text")
public func kirie_swift_send_text(_ viewID: Int64, _ messagePointer: UnsafePointer<CChar>?) {
    guard let messagePointer else {
        kirieLogEntry("kirie_swift_send_text ignored nil pointer")
        return
    }

    let message = String(cString: messagePointer)
    kirieLogEntry("kirie_swift_send_text viewID=\(viewID) bytes=\(message.utf8.count)")
    DispatchQueue.main.async {
        KirieManager.shared.sendText(message, viewID: viewID)
    }
}

@_cdecl("kirie_swift_send_binary")
public func kirie_swift_send_binary(_ viewID: Int64, _ bytesPointer: UnsafePointer<UInt8>?, _ byteCount: Int) {
    guard let bytesPointer else {
        kirieLogEntry("kirie_swift_send_binary ignored nil pointer")
        return
    }

    let bytes = Data(bytes: bytesPointer, count: byteCount)
    kirieLogEntry("kirie_swift_send_binary viewID=\(viewID) bytes=\(bytes.count)")
    DispatchQueue.main.async {
        KirieManager.shared.sendBinary(bytes, viewID: viewID)
    }
}

@_cdecl("kirie_swift_send_data_json")
public func kirie_swift_send_data_json(_ viewID: Int64, _ jsonPointer: UnsafePointer<CChar>?) {
    guard let jsonPointer else {
        kirieLogEntry("kirie_swift_send_data_json ignored nil pointer")
        return
    }

    let json = String(cString: jsonPointer)
    kirieLogEntry("kirie_swift_send_data_json viewID=\(viewID) bytes=\(json.utf8.count)")
    DispatchQueue.main.async {
        KirieManager.shared.sendDataJSON(json, viewID: viewID)
    }
}

private func kirieLogEntry(_ message: String) {
    NSLog("[Kirie][entry] %@", message)
}
