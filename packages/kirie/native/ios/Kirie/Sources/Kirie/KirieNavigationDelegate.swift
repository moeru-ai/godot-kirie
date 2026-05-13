import Foundation
import WebKit

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
