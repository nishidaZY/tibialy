import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var statusLabel: NSTextField!
    var spinner: NSProgressIndicator!

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        buildMainMenu()

        let width: CGFloat = 1200
        let height: CGFloat = 860

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: width, height: height),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "TibiaLootFinder"
        window.minSize = NSSize(width: 760, height: 560)
        window.center()
        window.isReleasedWhenClosed = false

        let container = window.contentView!
        container.wantsLayer = true
        container.layer?.backgroundColor = NSColor(calibratedRed: 0x28/255.0, green: 0x2A/255.0, blue: 0x36/255.0, alpha: 1).cgColor

        let config = WKWebViewConfiguration()
        webView = WKWebView(frame: container.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        webView.isHidden = true
        container.addSubview(webView)

        spinner = NSProgressIndicator(frame: NSRect(x: width / 2 - 16, y: height / 2 - 4, width: 32, height: 32))
        spinner.style = .spinning
        spinner.autoresizingMask = [.minXMargin, .maxXMargin, .minYMargin, .maxYMargin]
        spinner.startAnimation(nil)
        container.addSubview(spinner)

        statusLabel = NSTextField(labelWithString: "Starting TibiaLootFinder…")
        statusLabel.font = NSFont.systemFont(ofSize: 13)
        statusLabel.textColor = NSColor(calibratedWhite: 0.9, alpha: 1)
        statusLabel.alignment = .center
        statusLabel.sizeToFit()
        statusLabel.frame = NSRect(
            x: width / 2 - statusLabel.frame.width / 2,
            y: height / 2 - 34,
            width: statusLabel.frame.width,
            height: statusLabel.frame.height
        )
        statusLabel.autoresizingMask = [.minXMargin, .maxXMargin, .minYMargin, .maxYMargin]
        container.addSubview(statusLabel)

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        startServerThenLoad()
    }

    private func startServerThenLoad() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            let scriptPath = Bundle.main.resourcePath! + "/ensure_server.sh"

            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/bin/bash")
            process.arguments = [scriptPath]
            try? process.run()
            process.waitUntilExit()

            DispatchQueue.main.async {
                let url = URL(string: "http://localhost:3000")!
                self.webView.load(URLRequest(url: url))
            }
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        spinner.stopAnimation(nil)
        spinner.isHidden = true
        statusLabel.isHidden = true
        webView.isHidden = false
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        retryLoad(after: error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        retryLoad(after: error)
    }

    private func retryLoad(after error: Error) {
        statusLabel.stringValue = "Waiting for the server…"
        statusLabel.sizeToFit()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            guard let self else { return }
            self.webView.load(URLRequest(url: URL(string: "http://localhost:3000")!))
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    private func buildMainMenu() {
        let mainMenu = NSMenu()

        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Quit TibiaLootFinder", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenuItem.submenu = appMenu

        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editMenuItem.submenu = editMenu

        let windowMenuItem = NSMenuItem()
        mainMenu.addItem(windowMenuItem)
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.miniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowMenuItem.submenu = windowMenu
        NSApp.windowsMenu = windowMenu

        NSApp.mainMenu = mainMenu
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
