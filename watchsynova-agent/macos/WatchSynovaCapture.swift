import AppKit
import CoreGraphics

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let agentPath = NSString(string: "~/Library/Application Support/WatchSynova/watchsynova_screenshot_agent.py").expandingTildeInPath
    private var timer: Timer?
    private var statusItem: NSStatusItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        configureStatusItem()
        requestPermissionAndStart()
    }

    private func configureStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "WS"
        item.button?.toolTip = "WatchSynova screen capture"
        let menu = NSMenu()
        let status = NSMenuItem(title: "Screen capture is starting…", action: nil, keyEquivalent: "")
        status.tag = 100
        menu.addItem(status)
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit WatchSynova Capture", action: #selector(quit), keyEquivalent: "q"))
        item.menu = menu
        statusItem = item
    }

    private func requestPermissionAndStart() {
        let authorized = CGPreflightScreenCaptureAccess() || CGRequestScreenCaptureAccess()
        setStatus(authorized ? "Screen capture enabled" : "Permission required — enable in System Settings")
        guard authorized else { return }
        capture()
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            self?.capture()
        }
    }

    private func capture() {
        let path = agentPath
        DispatchQueue.global(qos: .utility).async {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
            process.arguments = [path, "--once"]
            do {
                try process.run()
                process.waitUntilExit()
                DispatchQueue.main.async { [weak self] in
                    self?.setStatus(process.terminationStatus == 0 ? "Last upload succeeded" : "Capture or upload failed")
                }
            } catch {
                DispatchQueue.main.async { [weak self] in self?.setStatus("Unable to start capture") }
            }
        }
    }

    private func setStatus(_ title: String) {
        statusItem?.menu?.item(withTag: 100)?.title = title
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.run()
