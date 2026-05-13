import Foundation
import UIKit
import WebKit

struct KirieRuntimeConfig {
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
    private var scriptMessageHandler: KirieScriptMessageHandler?
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

        KiriePacketChannel.allCases.forEach { channel in
            webView?.configuration.userContentController.removeScriptMessageHandler(forName: channel.rawValue)
        }
        webView?.navigationDelegate = nil
        webView?.stopLoading()
        webView?.removeFromSuperview()
        webView = nil
        scriptMessageHandler = nil

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

    func sendTextPacket(_ packet: Data) {
        sendPacket(packet, channel: .text)
    }

    func sendBinaryPacket(_ packet: Data) {
        sendPacket(packet, channel: .binary)
    }

    func sendDataPacket(_ packet: Data) {
        sendPacket(packet, channel: .data)
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
        let scriptMessageHandler = KirieScriptMessageHandler(manager: self)
        KiriePacketChannel.allCases.forEach { channel in
            userContentController.add(scriptMessageHandler, name: channel.rawValue)
        }
        userContentController.addUserScript(WKUserScript(
            source: Self.packetChannelScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))

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
        self.scriptMessageHandler = scriptMessageHandler
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

    func emitPacket(_ packet: Data, channel: KiriePacketChannel) {
        logInfo("\(channel.logName)_packet_received bytes=\(packet.count)")
        notificationCenter.post(name: channel.notificationName, object: packet)
    }

    func emitIpcError(_ message: String) {
        logError(message)
        notificationCenter.post(name: .kirieIpcError, object: message)
    }

    private func sendPacket(_ packet: Data, channel: KiriePacketChannel) {
        logInfo("send\(channel.logName.capitalized)Packet bytes=\(packet.count)")

        guard !packet.isEmpty else {
            emitIpcError("Cannot send empty \(channel.logName) packet")
            return
        }

        guard let webView else {
            emitIpcError("Cannot send \(channel.logName) because the WebView does not exist")
            return
        }

        let channelName = Self.javaScriptStringLiteral(channel.rawValue)
        let packetBase64 = Self.javaScriptStringLiteral(packet.base64EncodedString())
        let script = """
        (() => {
          const channel = window[\(channelName)];
          if (!channel || typeof channel.__kirieReceiveBase64 !== "function") {
            throw new Error("Kirie JavaScript channel is not ready: " + \(channelName));
          }
          channel.__kirieReceiveBase64(\(packetBase64));
        })();
        """

        webView.evaluateJavaScript(script) { [weak self] _, error in
            if let error {
                Task { @MainActor in
                    self?.emitIpcError("Failed to dispatch \(channel.logName) packet to WebView: \(error.localizedDescription)")
                }
                return
            }

            Task { @MainActor in
                self?.logInfo("Dispatched \(channel.logName) packet to WebView")
            }
        }
    }

    private static func javaScriptStringLiteral(_ value: String) -> String {
        guard let data = try? JSONEncoder().encode(value),
              let literal = String(data: data, encoding: .utf8) else {
            return "\"\""
        }

        return literal
    }

    func logInfo(_ message: String) {
        NSLog("[Kirie][session=%@] %@", sessionID, message)
    }

    private func logError(_ message: String) {
        NSLog("[Kirie][session=%@] ERROR %@", sessionID, message)
    }
}
