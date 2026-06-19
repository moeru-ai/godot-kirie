import Foundation

struct KirieResolvedURL {
    let url: URL
}

enum KirieURLResolver {
    static let resourceScheme = "kirie-resource"
    static let resourceHost = "bundle"

    private static let resSchemePrefix = "res://"

    static func resolveForWebView(_ urlString: String) throws -> KirieResolvedURL {
        guard urlString.lowercased().hasPrefix(resSchemePrefix) else {
            guard let url = URL(string: urlString) else {
                throw KirieURLResolverError.invalidURL(urlString)
            }

            return KirieResolvedURL(url: url)
        }

        return try resolveResourceURL(urlString)
    }

    static func bundleFileURL(forResolvedResourceURL url: URL) throws -> URL {
        guard resourceScheme == url.scheme?.lowercased(), resourceHost == url.host?.lowercased() else {
            throw KirieURLResolverError.invalidURL(url.absoluteString)
        }

        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            throw KirieURLResolverError.invalidURL(url.absoluteString)
        }

        let encodedPath = components.percentEncodedPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !encodedPath.isEmpty else {
            throw KirieURLResolverError.emptyResourcePath
        }

        guard hasValidPercentEncoding(encodedPath) else {
            throw KirieURLResolverError.invalidPercentEncoding(url.absoluteString)
        }

        let decodedPath = encodedPath.removingPercentEncoding?.trimmingCharacters(in: CharacterSet(charactersIn: "/")) ?? ""
        guard !decodedPath.isEmpty else {
            throw KirieURLResolverError.emptyResourcePath
        }

        guard !decodedPath.contains("\0"), !containsPathTraversal(decodedPath) else {
            throw KirieURLResolverError.unsafeResourcePath(url.absoluteString)
        }

        return try bundleFileURL(forAssetPath: resolveAssetPath(decodedPath))
    }

    private static func resolveResourceURL(_ urlString: String) throws -> KirieResolvedURL {
        let suffix = String(urlString.dropFirst(resSchemePrefix.count))
        let pathEnd = suffix.firstIndex { character in
            character == "?" || character == "#"
        } ?? suffix.endIndex
        let encodedPath = String(suffix[..<pathEnd])
        let queryAndFragment = String(suffix[pathEnd...])

        guard !encodedPath.isEmpty else {
            throw KirieURLResolverError.emptyResourcePath
        }

        guard hasValidPercentEncoding(encodedPath) else {
            throw KirieURLResolverError.invalidPercentEncoding(urlString)
        }

        let decodedPath = encodedPath.removingPercentEncoding?.trimmingCharacters(in: CharacterSet(charactersIn: "/")) ?? ""
        guard !decodedPath.isEmpty else {
            throw KirieURLResolverError.emptyResourcePath
        }

        guard !decodedPath.contains("\0"), !containsPathTraversal(decodedPath) else {
            throw KirieURLResolverError.unsafeResourcePath(urlString)
        }

        let assetPath = resolveAssetPath(decodedPath)
        _ = try bundleFileURL(forAssetPath: assetPath)

        var components = URLComponents()
        components.scheme = resourceScheme
        components.host = resourceHost
        components.path = "/" + assetPath
        try applyQueryAndFragment(queryAndFragment, to: &components)

        guard let url = components.url else {
            throw KirieURLResolverError.invalidURL(urlString)
        }

        return KirieResolvedURL(url: url)
    }

    private static func applyQueryAndFragment(_ queryAndFragment: String, to components: inout URLComponents) throws {
        guard !queryAndFragment.isEmpty else {
            return
        }

        if queryAndFragment.hasPrefix("?") {
            let tail = queryAndFragment.dropFirst()
            if let fragmentStart = tail.firstIndex(of: "#") {
                components.percentEncodedQuery = String(tail[..<fragmentStart])
                components.percentEncodedFragment = String(tail[tail.index(after: fragmentStart)...])
            } else {
                components.percentEncodedQuery = String(tail)
            }
        } else if queryAndFragment.hasPrefix("#") {
            components.percentEncodedFragment = String(queryAndFragment.dropFirst())
        }
    }

    private static func bundleFileURL(forAssetPath assetPath: String) throws -> URL {
        guard let bundleResourceURL = Bundle.main.resourceURL else {
            throw KirieURLResolverError.missingBundleResourceURL
        }

        let candidates = resourceCandidates(for: assetPath, bundleResourceURL: bundleResourceURL)
        guard let resolvedResource = candidates.first(where: { FileManager.default.fileExists(atPath: $0.fileURL.path) }) else {
            throw KirieURLResolverError.resourceNotFound(
                assetPath,
                candidates.map { "\($0.assetPath) at \($0.fileURL.path)" }
            )
        }

        return resolvedResource.fileURL
    }

    private static func resourceCandidates(for assetPath: String, bundleResourceURL: URL) -> [KirieBundleResourceCandidate] {
        var candidates = [
            KirieBundleResourceCandidate(
                assetPath: assetPath,
                fileURL: bundleResourceURL.appendingPathComponent(assetPath, isDirectory: false)
            ),
        ]

        if assetPath.hasPrefix("src-web/dist/") {
            candidates.append(
                KirieBundleResourceCandidate(
                    assetPath: String(assetPath.dropFirst("src-web/".count)),
                    fileURL: bundleResourceURL.appendingPathComponent(String(assetPath.dropFirst("src-web/".count)), isDirectory: false)
                )
            )
        }

        if let executableName = Bundle.main.object(forInfoDictionaryKey: "CFBundleExecutable") as? String {
            candidates.append(
                KirieBundleResourceCandidate(
                    assetPath: "\(executableName)/\(assetPath)",
                    fileURL: bundleResourceURL
                        .appendingPathComponent(executableName, isDirectory: true)
                        .appendingPathComponent(assetPath, isDirectory: false)
                )
            )
        }

        return candidates
    }

    private static func resolveAssetPath(_ path: String) -> String {
        let trimmedPath = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let lastSegment = trimmedPath.split(separator: "/").last.map(String.init) ?? ""

        if path.hasSuffix("/") || !lastSegment.contains(".") {
            return "\(trimmedPath)/index.html"
        }

        return trimmedPath
    }

    private static func hasValidPercentEncoding(_ value: String) -> Bool {
        var index = value.startIndex

        while index < value.endIndex {
            guard value[index] == "%" else {
                index = value.index(after: index)
                continue
            }

            let firstHexIndex = value.index(after: index)
            guard firstHexIndex < value.endIndex else {
                return false
            }

            let secondHexIndex = value.index(after: firstHexIndex)
            guard secondHexIndex < value.endIndex else {
                return false
            }

            guard value[firstHexIndex].isHexDigit, value[secondHexIndex].isHexDigit else {
                return false
            }

            index = value.index(after: secondHexIndex)
        }

        return true
    }

    private static func containsPathTraversal(_ path: String) -> Bool {
        path.replacingOccurrences(of: "\\", with: "/")
            .split(separator: "/", omittingEmptySubsequences: false)
            .contains("..")
    }
}

private struct KirieBundleResourceCandidate {
    let assetPath: String
    let fileURL: URL
}

enum KirieURLResolverError: LocalizedError {
    case emptyResourcePath
    case invalidPercentEncoding(String)
    case invalidURL(String)
    case missingBundleResourceURL
    case resourceNotFound(String, [String])
    case unsafeResourcePath(String)

    var errorDescription: String? {
        switch self {
        case .emptyResourcePath:
            return "Cannot load empty res:// asset path"
        case let .invalidPercentEncoding(url):
            return "Cannot load res:// URL with invalid percent encoding: \(url)"
        case let .invalidURL(url):
            return "Cannot load invalid URL: \(url)"
        case .missingBundleResourceURL:
            return "Cannot load res:// URL because the app bundle resource URL is unavailable"
        case let .resourceNotFound(assetPath, candidates):
            return "Cannot load res:// asset because it was not found in the app bundle: \(assetPath); "
                + "checked \(candidates.joined(separator: ", "))"
        case let .unsafeResourcePath(url):
            return "Cannot load unsafe res:// asset path: \(url)"
        }
    }
}
