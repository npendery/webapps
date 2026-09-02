import AppKit
import Foundation

// LinkRouter: a default browser that forwards each URL to the app whose
// routes match it, or to the fallback browser. Config lives in
// ~/.config/webapps/routes.json (override with LINKROUTER_CONFIG).

// MARK: - Config

struct Route: Decodable {
    let bundleId: String
    let match: [String]
}

struct Config: Decodable {
    let fallback: String
    let routes: [Route]
}

let safariBundleId = "com.apple.Safari"
let ownBundleId = Bundle.main.bundleIdentifier ?? "dev.nick.webapps.linkrouter"

func configPath() -> URL {
    if let env = ProcessInfo.processInfo.environment["LINKROUTER_CONFIG"], !env.isEmpty {
        return URL(fileURLWithPath: env)
    }
    return FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".config/webapps/routes.json")
}

func loadConfig() -> Config {
    let path = configPath()
    do {
        let data = try Data(contentsOf: path)
        var config = try JSONDecoder().decode(Config.self, from: data)
        if config.fallback == ownBundleId {
            log("fallback points at LinkRouter itself; using Safari")
            config = Config(fallback: safariBundleId, routes: config.routes)
        }
        return config
    } catch {
        log("config error at \(path.path): \(error); routing everything to Safari")
        return Config(fallback: safariBundleId, routes: [])
    }
}

// MARK: - Logging

func log(_ message: String) {
    let line = "\(ISO8601DateFormatter().string(from: Date())) \(message)\n"
    let file = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Logs/LinkRouter.log")
    if let handle = try? FileHandle(forWritingTo: file) {
        handle.seekToEndOfFile()
        handle.write(Data(line.utf8))
        try? handle.close()
    } else {
        try? line.write(to: file, atomically: true, encoding: .utf8)
    }
}

// MARK: - Matching (mirrors shell/src/shared/matcher.ts)

struct HostPattern {
    let host: String
    let wildcard: Bool
    let pathPrefix: String?

    init(_ raw: String) {
        var text = raw.trimmingCharacters(in: .whitespaces).lowercased()
        var prefix: String? = nil
        if let slash = text.firstIndex(of: "/") {
            prefix = String(text[slash...])
            text = String(text[..<slash])
        }
        if text.hasPrefix("*.") {
            wildcard = true
            host = String(text.dropFirst(2))
        } else {
            wildcard = false
            host = text
        }
        pathPrefix = prefix
    }

    func matches(_ url: URL) -> Bool {
        guard let urlHost = url.host?.lowercased() else { return false }
        let hostOk = wildcard ? urlHost.hasSuffix("." + host) : urlHost == host
        guard hostOk else { return false }
        guard let prefix = pathPrefix else { return true }
        return url.path.hasPrefix(prefix)
    }
}

func parseHttpUrl(_ text: String) -> URL? {
    guard let url = URL(string: text),
          let scheme = url.scheme?.lowercased(),
          scheme == "http" || scheme == "https",
          url.host != nil else { return nil }
    return url
}

func unwrapRedirect(_ url: URL) -> URL {
    guard url.host?.lowercased() == "www.google.com", url.path == "/url",
          let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
          let items = components.queryItems,
          let target = items.first(where: { $0.name == "q" })?.value
            ?? items.first(where: { $0.name == "url" })?.value,
          let unwrapped = parseHttpUrl(target) else { return url }
    return unwrapped
}

func normalize(_ text: String) -> URL? {
    guard let url = parseHttpUrl(text) else { return nil }
    return unwrapRedirect(url)
}

func target(for text: String, config: Config) -> String {
    guard let url = normalize(text) else { return config.fallback }
    for route in config.routes {
        for pattern in route.match where HostPattern(pattern).matches(url) {
            return route.bundleId
        }
    }
    return config.fallback
}

// MARK: - Opening

/// Scheme, host and path only. Query strings carry SSO tokens and must not be logged.
func redacted(_ url: URL) -> String {
    let scheme = url.scheme ?? "?"
    let host = url.host ?? "?"
    return url.query == nil ? "\(scheme)://\(host)\(url.path)" : "\(scheme)://\(host)\(url.path)?…"
}

/// Prefer the installed copy when Launch Services knows several bundles with
/// this id (e.g. a build left in the repo's dist/ directory).
func appURL(for bundleId: String) -> URL? {
    let candidates = NSWorkspace.shared.urlsForApplications(withBundleIdentifier: bundleId)
    if let installed = candidates.first(where: { $0.path.hasPrefix("/Applications/") }) {
        return installed
    }
    return candidates.first ?? NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId)
}

func open(_ url: URL, config: Config, completion: @escaping () -> Void) {
    let chosen = target(for: url.absoluteString, config: config)
    let destination = appURL(for: chosen) ?? appURL(for: config.fallback) ?? appURL(for: safariBundleId)
    guard let app = destination else {
        log("no app found for \(chosen) or fallback; giving up on \(url)")
        completion()
        return
    }
    let deliver = unwrapRedirect(url)
    log("\(redacted(url)) -> \(chosen) (\(app.lastPathComponent))")
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.activates = true
    NSWorkspace.shared.open([deliver], withApplicationAt: app, configuration: configuration) { _, error in
        if let error = error { log("open failed: \(error)") }
        completion()
    }
}

// MARK: - CLI modes

func runDryRun(_ urls: [String]) {
    let config = loadConfig()
    for text in urls {
        print("\(text) -> \(target(for: text, config: config))")
    }
}

func currentDefaultBundleId(for scheme: String) -> String? {
    guard let probe = URL(string: "\(scheme)://example.com/"),
          let app = NSWorkspace.shared.urlForApplication(toOpen: probe) else { return nil }
    return Bundle(url: app)?.bundleIdentifier
}

func runSetDefault() {
    // The API reports "The file couldn't be opened" when LinkRouter is already
    // the handler, so the result is judged by re-reading the default afterwards.
    var allSet = true
    for scheme in ["https", "http"] {
        if currentDefaultBundleId(for: scheme) == ownBundleId {
            print("\(scheme): LinkRouter is already the default handler")
            continue
        }
        var done = false
        NSWorkspace.shared.setDefaultApplication(at: Bundle.main.bundleURL, toOpenURLsWithScheme: scheme) { _ in
            done = true
        }
        while !done {
            RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.1))
        }
        let now = currentDefaultBundleId(for: scheme) ?? "unknown"
        if now == ownBundleId {
            print("\(scheme): LinkRouter is now the default handler")
        } else {
            allSet = false
            print("\(scheme): default handler is still \(now); confirm the macOS dialog or set it in System Settings > Desktop & Dock")
        }
    }
    exit(allSet ? 0 : 1)
}

// MARK: - App delegate

final class RouterDelegate: NSObject, NSApplicationDelegate {
    private let config = loadConfig()
    private var inFlight = 0
    private var receivedAny = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Launched with no URL (e.g. double-clicked): exit quietly.
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            if self?.receivedAny == false { NSApp.terminate(nil) }
        }
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        receivedAny = true
        for url in urls {
            inFlight += 1
            open(url, config: config) { [weak self] in
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    self.inFlight -= 1
                    if self.inFlight == 0 { NSApp.terminate(nil) }
                }
            }
        }
    }
}

// MARK: - Entry

let arguments = Array(CommandLine.arguments.dropFirst())
if arguments.first == "--dry-run" {
    runDryRun(Array(arguments.dropFirst()))
    exit(0)
} else if arguments.first == "--set-default" {
    runSetDefault()
    exit(0)
} else {
    let application = NSApplication.shared
    let delegate = RouterDelegate()
    application.delegate = delegate
    application.run()
}
