import Dispatch
import Foundation

private let kirieEntryMarker = "TRACE-2026-03-19-13:33Z"

@_cdecl("kirie_swift_init")
public func kirie_swift_init() {
    NSLog("[Kirie][%@] kirie_swift_init() called", kirieEntryMarker)
    DispatchQueue.main.async {
        NSLog("[Kirie][%@] kirie_swift_init() executing on main queue", kirieEntryMarker)
        KirieManager.shared.start()
    }
}

@_cdecl("kirie_swift_deinit")
public func kirie_swift_deinit() {
    NSLog("[Kirie][%@] kirie_swift_deinit() called", kirieEntryMarker)
    DispatchQueue.main.async {
        NSLog("[Kirie][%@] kirie_swift_deinit() executing on main queue", kirieEntryMarker)
        KirieManager.shared.stop()
    }
}

@_cdecl("kirie_swift_create_webview")
public func kirie_swift_create_webview(_ initialURLPointer: UnsafePointer<CChar>?) {
    let initialURL = initialURLPointer.map { String(cString: $0) }
    DispatchQueue.main.async {
        KirieManager.shared.createWebView(initialURL: initialURL?.isEmpty == true ? nil : initialURL)
    }
}

@_cdecl("kirie_swift_destroy_webview")
public func kirie_swift_destroy_webview() {
    DispatchQueue.main.async {
        KirieManager.shared.destroyWebView()
    }
}

@_cdecl("kirie_swift_load_url")
public func kirie_swift_load_url(_ urlPointer: UnsafePointer<CChar>?) {
    guard let urlPointer else {
        return
    }

    let url = String(cString: urlPointer)
    DispatchQueue.main.async {
        KirieManager.shared.loadURL(url)
    }
}

@_cdecl("kirie_swift_send_ipc_message")
public func kirie_swift_send_ipc_message(_ messageJSONPointer: UnsafePointer<CChar>?) {
    guard let messageJSONPointer else {
        return
    }

    let messageJSON = String(cString: messageJSONPointer)
    DispatchQueue.main.async {
        KirieManager.shared.sendIpcMessage(messageJSON)
    }
}
