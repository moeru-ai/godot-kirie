import Foundation
import UIKit
import WebKit

private enum KirieTrace {
    static let buildMarker = "TRACE-2026-04-23-IPC"
}

private extension Notification.Name {
    static let kirieWebViewReady = Notification.Name("KirieWebViewReady")
    static let kirieIpcMessageReceived = Notification.Name("KirieIpcMessageReceived")
    static let kirieIpcError = Notification.Name("KirieIpcError")
}

@MainActor
final class KirieManager: NSObject {
    static let shared = KirieManager()

    private let notificationCenter = NotificationCenter.default
    private let sessionID = UUID().uuidString.lowercased()
    private var containerView: UIView?
    private var webView: WKWebView?
    private var hasStarted = false

    private override init() {
        super.init()
        logInfo("Manager initialized")
    }

    func start() {
        guard !hasStarted else {
            logInfo("start() ignored because the manager has already started")
            return
        }

        hasStarted = true
        logInfo("Manager started; mainBundle=\(Bundle.main.bundleIdentifier ?? "<nil>")")
    }

    func stop() {
        logInfo("stop() invoked")
        destroyWebView()
        hasStarted = false
    }

    func createWebView(initialURL: String?) {
        guard let hostWindow = resolveHostWindow() else {
            emitIpcError("Cannot create WebView because no host window was found")
            return
        }

        let containerView = ensureContainerView(attachedTo: hostWindow)
        let webView = ensureWebView(attachedTo: containerView)
        emitWebViewReady()

        if let initialURL, !initialURL.isEmpty {
            load(initialURL, in: webView)
        }
    }

    func destroyWebView() {
        logInfo("Destroying WebView")

        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "kirie")
        webView?.navigationDelegate = nil
        webView?.stopLoading()
        webView?.removeFromSuperview()
        webView = nil

        containerView?.removeFromSuperview()
        containerView = nil
    }

    func loadURL(_ url: String) {
        guard let webView else {
            emitIpcError("Cannot load URL because the WebView does not exist")
            return
        }

        load(url, in: webView)
    }

    func sendIpcMessage(_ messageJSON: String) {
        guard let webView else {
            emitIpcError("Cannot send IPC message because the WebView does not exist")
            return
        }

        let script = """
        window.dispatchEvent(new CustomEvent("kirie:ipc-message", { detail: \(messageJSON) }));
        """

        webView.evaluateJavaScript(script) { [weak self] _, error in
            if let error {
                Task { @MainActor in
                    self?.emitIpcError("Failed to dispatch IPC message to WebView: \(error.localizedDescription)")
                }
            }
        }
    }

    private func load(_ urlString: String, in webView: WKWebView) {
        guard let url = URL(string: urlString) else {
            emitIpcError("Cannot load invalid URL: \(urlString)")
            return
        }

        logInfo("Loading URL: \(url.absoluteString)")
        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30))
    }

    private func ensureContainerView(attachedTo hostView: UIView) -> UIView {
        if let existingContainerView = containerView {
            if existingContainerView.superview !== hostView {
                existingContainerView.removeFromSuperview()
                hostView.addSubview(existingContainerView)
                pinToEdges(existingContainerView, in: hostView)
            }

            return existingContainerView
        }

        let containerView = UIView(frame: .zero)
        containerView.translatesAutoresizingMaskIntoConstraints = false
        containerView.backgroundColor = .clear
        containerView.isOpaque = false
        containerView.clipsToBounds = true
        containerView.accessibilityIdentifier = "KirieContainer"

        hostView.addSubview(containerView)
        pinToEdges(containerView, in: hostView)

        self.containerView = containerView
        return containerView
    }

    private func ensureWebView(attachedTo containerView: UIView) -> WKWebView {
        if let existingWebView = webView {
            if existingWebView.superview !== containerView {
                existingWebView.removeFromSuperview()
                containerView.addSubview(existingWebView)
                pinToEdges(existingWebView, in: containerView)
            }

            return existingWebView
        }

        let userContentController = WKUserContentController()
        userContentController.add(self, name: "kirie")

        let webViewConfiguration = WKWebViewConfiguration()
        webViewConfiguration.allowsInlineMediaPlayback = true
        webViewConfiguration.defaultWebpagePreferences.allowsContentJavaScript = true
        webViewConfiguration.userContentController = userContentController

        let webView = WKWebView(frame: .zero, configuration: webViewConfiguration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.accessibilityIdentifier = "KirieWebView"

        containerView.addSubview(webView)
        pinToEdges(webView, in: containerView)

        self.webView = webView
        logInfo("Created WebView")
        return webView
    }

    private func resolveHostWindow() -> UIWindow? {
        let activeScenes = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .filter { scene in
                scene.activationState == .foregroundActive || scene.activationState == .foregroundInactive
            }

        for scene in activeScenes {
            if let keyWindow = scene.windows.first(where: \.isKeyWindow) {
                return keyWindow
            }

            if let firstWindow = scene.windows.first {
                return firstWindow
            }
        }

        return nil
    }

    private func pinToEdges(_ childView: UIView, in parentView: UIView) {
        NSLayoutConstraint.activate([
            childView.leadingAnchor.constraint(equalTo: parentView.leadingAnchor),
            childView.trailingAnchor.constraint(equalTo: parentView.trailingAnchor),
            childView.topAnchor.constraint(equalTo: parentView.topAnchor),
            childView.bottomAnchor.constraint(equalTo: parentView.bottomAnchor),
        ])
    }

    private func emitWebViewReady() {
        notificationCenter.post(name: .kirieWebViewReady, object: nil)
    }

    private func emitIpcMessage(_ messageJSON: String) {
        logInfo("ipc_message_received message=\(messageJSON)")
        notificationCenter.post(name: .kirieIpcMessageReceived, object: messageJSON)
    }

    private func emitIpcError(_ message: String) {
        logError(message)
        notificationCenter.post(name: .kirieIpcError, object: message)
    }

    private func logInfo(_ message: String) {
        NSLog("[Kirie][%@][session=%@] %@", KirieTrace.buildMarker, sessionID, message)
    }

    private func logError(_ message: String) {
        NSLog("[Kirie][%@][session=%@] ERROR %@", KirieTrace.buildMarker, sessionID, message)
    }
}

extension KirieManager: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "kirie" else {
            return
        }

        if let messageJSON = message.body as? String {
            emitIpcMessage(messageJSON)
            return
        }

        if JSONSerialization.isValidJSONObject(message.body),
           let data = try? JSONSerialization.data(withJSONObject: message.body),
           let messageJSON = String(data: data, encoding: .utf8) {
            emitIpcMessage(messageJSON)
            return
        }

        emitIpcError("Received unsupported IPC message from JavaScript")
    }
}

extension KirieManager: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        emitIpcError("Navigation failed: \(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        emitIpcError("Initial navigation failed: \(error.localizedDescription)")
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        emitIpcError("Web content process terminated")
    }

    func webView(
        _ webView: WKWebView,
        respondTo challenge: URLAuthenticationChallenge
    ) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        let protectionSpace = challenge.protectionSpace

        // TODO: Restrict invalid TLS bypass to debug-only before shipping.
        if protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
           let serverTrust = protectionSpace.serverTrust {
            return (.useCredential, URLCredential(trust: serverTrust))
        }

        return (.performDefaultHandling, nil)
    }
}
