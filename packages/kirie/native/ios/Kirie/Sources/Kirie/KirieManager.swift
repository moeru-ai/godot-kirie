import Foundation
import UIKit
import WebKit

private extension Notification.Name {
    static let kirieWebViewReady = Notification.Name("KirieWebViewReady")
    static let kirieIpcMessageReceived = Notification.Name("KirieIpcMessageReceived")
    static let kirieIpcError = Notification.Name("KirieIpcError")
}

private struct KirieRuntimeConfig {
    private static let enableWebInspectorKey = "KirieEnableWebInspector"
    private static let allowTlsBypassKey = "KirieAllowTlsBypass"

    let enableWebInspector: Bool
    let allowTlsBypass: Bool

    static var current: KirieRuntimeConfig {
        let bundle = Bundle.main
        return KirieRuntimeConfig(
            enableWebInspector: bundle.object(forInfoDictionaryKey: enableWebInspectorKey) as? Bool ?? false,
            allowTlsBypass: bundle.object(forInfoDictionaryKey: allowTlsBypassKey) as? Bool ?? false
        )
    }
}

@MainActor
final class KirieManager: NSObject {
    static let shared = KirieManager()

    private static let hostWindowRetryDelay: TimeInterval = 0.1
    private static let maxHostWindowResolveAttempts = 50

    private let notificationCenter = NotificationCenter.default
    private let sessionID = UUID().uuidString.lowercased()
    private let resourceURLSchemeHandler = KirieResourceURLSchemeHandler()
    private var containerView: UIView?
    private var webView: WKWebView?

    private override init() {
        super.init()
        logInfo("Manager initialized")
    }

    func createWebView(initialURL: String?) {
        createWebView(initialURL: initialURL, remainingHostWindowAttempts: Self.maxHostWindowResolveAttempts)
    }

    private func createWebView(initialURL: String?, remainingHostWindowAttempts: Int) {
        logInfo(
            "createWebView initialURL=\(initialURL ?? "<nil>") "
                + "remainingHostWindowAttempts=\(remainingHostWindowAttempts)"
        )

        guard let hostWindow = resolveHostWindow() else {
            if remainingHostWindowAttempts > 0 {
                logInfo("No active host window yet; retrying WebView creation")
                DispatchQueue.main.asyncAfter(deadline: .now() + Self.hostWindowRetryDelay) { [weak self] in
                    self?.createWebView(
                        initialURL: initialURL,
                        remainingHostWindowAttempts: remainingHostWindowAttempts - 1
                    )
                }
                return
            }

            emitIpcError("Cannot create WebView because no host window was found")
            return
        }

        let containerView = ensureContainerView(attachedTo: hostWindow)
        let webView = ensureWebView(attachedTo: containerView)
        hostWindow.layoutIfNeeded()

        DispatchQueue.main.async { [weak self, weak webView] in
            guard let self, let webView, webView === self.webView else {
                return
            }

            self.emitWebViewReady()

            if let initialURL, !initialURL.isEmpty {
                self.load(initialURL, in: webView)
            }
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
        logInfo("loadURL url=\(url)")

        guard let webView else {
            emitIpcError("Cannot load URL because the WebView does not exist")
            return
        }

        load(url, in: webView)
    }

    func loadHTMLString(_ html: String, baseURLString: String?) {
        guard let webView else {
            emitIpcError("Cannot load HTML string because the WebView does not exist")
            return
        }

        let baseURL: URL?
        if let baseURLString, !baseURLString.isEmpty {
            guard let parsedBaseURL = URL(string: baseURLString) else {
                emitIpcError("Cannot load HTML string with invalid base URL: \(baseURLString)")
                return
            }

            baseURL = parsedBaseURL
        } else {
            baseURL = nil
        }

        logInfo("Loading HTML string; baseURL=\(baseURL?.absoluteString ?? "<nil>")")
        webView.loadHTMLString(html, baseURL: baseURL)
    }

    func sendIpcMessage(_ messageJSON: String) {
        logInfo("sendIpcMessage message=\(messageJSON)")

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
                return
            }

            Task { @MainActor in
                self?.logInfo("Dispatched IPC message to WebView")
            }
        }
    }

    private func load(_ urlString: String, in webView: WKWebView) {
        let resolvedURL: KirieResolvedURL
        do {
            resolvedURL = try KirieURLResolver.resolveForWebView(urlString)
        } catch {
            emitIpcError(error.localizedDescription)
            return
        }

        logInfo("Loading URL: \(resolvedURL.url.absoluteString)")
        webView.load(URLRequest(url: resolvedURL.url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30))
    }

    private func ensureContainerView(attachedTo hostView: UIView) -> UIView {
        if let existingContainerView = containerView {
            if existingContainerView.superview !== hostView {
                logInfo("Reattaching existing container view")
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
        logInfo("Created container view")
        return containerView
    }

    private func ensureWebView(attachedTo containerView: UIView) -> WKWebView {
        if let existingWebView = webView {
            if existingWebView.superview !== containerView {
                logInfo("Reattaching existing WebView")
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
        webViewConfiguration.setURLSchemeHandler(
            resourceURLSchemeHandler,
            forURLScheme: KirieURLResolver.resourceScheme
        )

        let webView = WKWebView(frame: .zero, configuration: webViewConfiguration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.accessibilityIdentifier = "KirieWebView"

        if #available(iOS 16.4, *) {
            webView.isInspectable = KirieRuntimeConfig.current.enableWebInspector
        }

        containerView.addSubview(webView)
        pinToEdges(webView, in: containerView)

        self.webView = webView
        logInfo("Created WebView")
        return webView
    }

    private func resolveHostWindow() -> UIWindow? {
        let activeScenes = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }

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
        logInfo("Emitting webview_ready")
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
        NSLog("[Kirie][session=%@] %@", sessionID, message)
    }

    private func logError(_ message: String) {
        NSLog("[Kirie][session=%@] ERROR %@", sessionID, message)
    }
}

extension KirieManager: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        logInfo("Received WKScriptMessage name=\(message.name) bodyType=\(type(of: message.body))")

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
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        logInfo("Navigation started url=\(webView.url?.absoluteString ?? "<nil>")")
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        logInfo("Navigation committed url=\(webView.url?.absoluteString ?? "<nil>")")
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        logInfo("Navigation finished url=\(webView.url?.absoluteString ?? "<nil>")")
    }

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

        guard KirieRuntimeConfig.current.allowTlsBypass,
              protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let serverTrust = protectionSpace.serverTrust else {
            return (.performDefaultHandling, nil)
        }

        return (.useCredential, URLCredential(trust: serverTrust))
    }
}
