package ai.moeru.kirie.android

import android.net.Uri
import android.net.http.SslError
import android.util.Log
import android.webkit.SslErrorHandler
import android.webkit.WebView
import android.webkit.WebViewClient

class DebugTlsBypassWebViewClient(
    private val serverUrl: String?,
) : WebViewClient() {

    override fun onReceivedSslError(
        view: WebView,
        handler: SslErrorHandler,
        error: SslError,
    ) {
        if (shouldBypassDevServerCertificate(error)) {
            Log.w(TAG, "Bypassing TLS certificate validation for debug dev server: ${error.url}")
            handler.proceed()
            return
        }

        handler.cancel()
    }

    private fun shouldBypassDevServerCertificate(error: SslError?): Boolean {
        if (!BuildConfig.DEBUG || error == null) {
            return false
        }

        val errorUrl = error.url ?: return false
        val errorUri = Uri.parse(errorUrl)

        if (!HTTPS_SCHEME.equals(errorUri.scheme, ignoreCase = true)) {
            return false
        }

        if (!serverUrl.isNullOrBlank()) {
            val serverUri = Uri.parse(serverUrl)
            if (!HTTPS_SCHEME.equals(serverUri.scheme, ignoreCase = true)) {
                return false
            }

            val serverHost = serverUri.host
            val errorHost = errorUri.host
            return serverHost != null &&
                errorHost != null &&
                serverHost.equals(errorHost, ignoreCase = true) &&
                normalizePort(serverUri) == normalizePort(errorUri)
        }

        return isLocalDevelopmentHost(errorUri.host)
    }

    private fun isLocalDevelopmentHost(host: String?): Boolean {
        if (host.isNullOrBlank()) {
            return false
        }

        if (
            host.equals("localhost", ignoreCase = true) ||
            host == "127.0.0.1" ||
            host == "10.0.2.2" ||
            host == "10.0.3.2" ||
            host == "::1"
        ) {
            return true
        }

        if (host.endsWith(".local")) {
            return true
        }

        if (host.startsWith("10.") || host.startsWith("192.168.")) {
            return true
        }

        if (!host.startsWith("172.")) {
            return false
        }

        val segments = host.split('.')
        if (segments.size < 2) {
            return false
        }

        val secondOctet = segments[1].toIntOrNull() ?: return false
        return secondOctet in 16..31
    }

    private fun normalizePort(uri: Uri): Int {
        val port = uri.port
        if (port != -1) {
            return port
        }

        return when {
            HTTPS_SCHEME.equals(uri.scheme, ignoreCase = true) -> 443
            HTTP_SCHEME.equals(uri.scheme, ignoreCase = true) -> 80
            else -> -1
        }
    }

    companion object {
        private const val TAG = "Kirie"
        private const val HTTP_SCHEME = "http"
        private const val HTTPS_SCHEME = "https"
    }
}
