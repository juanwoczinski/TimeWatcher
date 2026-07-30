import AppKit
import CoreGraphics

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let agentPath = NSString(string: "~/Library/Application Support/WatchSynova/watchsynova_screenshot_agent.py").expandingTildeInPath
    private let activityWatchBin = NSString(string: "~/Applications/ActivityWatch.app/Contents/MacOS").expandingTildeInPath
    private var timer: Timer?
    private var statusItem: NSStatusItem?
    private var modules: [Process] = []

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        configureStatusItem()
        startActivityModules()
        requestPermissionAndStart()
    }

    private func configureStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "TW"
        item.button?.toolTip = "TimeWatcher"
        let menu = NSMenu()
        let name = NSMenuItem(title: "TimeWatcher", action: nil, keyEquivalent: "")
        name.isEnabled = false
        menu.addItem(name)
        let status = NSMenuItem(title: "Starting monitoring and sync…", action: nil, keyEquivalent: "")
        status.tag = 100
        menu.addItem(status)
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Open Local Dashboard", action: #selector(openLocalDashboard), keyEquivalent: "l"))
        menu.addItem(NSMenuItem(title: "Open Cloud Dashboard", action: #selector(openCloudDashboard), keyEquivalent: "d"))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit TimeWatcher", action: #selector(quit), keyEquivalent: "q"))
        item.menu = menu
        statusItem = item
    }

    private func requestPermissionAndStart() {
        let authorized = CGPreflightScreenCaptureAccess() || CGRequestScreenCaptureAccess()
        setStatus(authorized ? "Monitoring and secure sync enabled" : "Sync enabled — screen permission required")
        runAgent(captureScreen: authorized)
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            self?.runAgent(captureScreen: authorized)
        }
    }

    private func runAgent(captureScreen: Bool) {
        let path = agentPath
        DispatchQueue.global(qos: .utility).async {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
            process.arguments = [path, captureScreen ? "--once" : "--sync-only"]
            do {
                try process.run()
                process.waitUntilExit()
                DispatchQueue.main.async { [weak self] in
                    self?.setStatus(process.terminationStatus == 0 ? "Last secure sync succeeded" : "Sync needs attention")
                }
            } catch {
                DispatchQueue.main.async { [weak self] in self?.setStatus("Unable to start capture") }
            }
        }
    }

    private func startActivityModules() {
        startModule("aw-server")
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            self?.startModule("aw-watcher-afk")
            self?.startModule("aw-watcher-window")
            self?.startModule("aw-watcher-input")
        }
    }

    private func startModule(_ name: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "\(activityWatchBin)/\(name)")
        do {
            try process.run()
            modules.append(process)
        } catch {
            setStatus("Unable to start \(name)")
        }
    }

    private func setStatus(_ title: String) {
        statusItem?.menu?.item(withTag: 100)?.title = title
    }

    @objc private func openLocalDashboard() {
        NSWorkspace.shared.open(URL(string: "http://127.0.0.1:5600")!)
    }

    @objc private func openCloudDashboard() {
        NSWorkspace.shared.open(URL(string: "https://timewatcher.32-193-139-223.sslip.io")!)
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }

    func applicationWillTerminate(_ notification: Notification) {
        timer?.invalidate()
        for process in modules where process.isRunning { process.terminate() }
    }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.run()
