import AppKit
import ApplicationServices
import CoreGraphics

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let agentPath = NSString(string: "~/Library/Application Support/WatchSynova/watchsynova_screenshot_agent.py").expandingTildeInPath
    private lazy var activityWatchBin: String? = {
        var candidates: [String] = []
        if let resources = Bundle.main.resourcePath {
            candidates.append(resources + "/ActivityWatch.app/Contents/MacOS")
        }
        candidates += [
            "/Applications/ActivityWatch.app/Contents/MacOS",
            NSHomeDirectory() + "/Applications/ActivityWatch.app/Contents/MacOS"
        ]
        return candidates.first { candidate in
            FileManager.default.isExecutableFile(atPath: candidate + "/aw-server") &&
            FileManager.default.isExecutableFile(atPath: candidate + "/aw-watcher-window")
        }
    }()
    private let configPath = NSString(string: "~/Library/Application Support/WatchSynova/screenshot-agent.json").expandingTildeInPath
    private var timer: Timer?
    private var webTimer: Timer?
    private var webSyncInFlight = false
    private var statusItem: NSStatusItem?
    private var modules: [Process] = []
    private var accessibilityModulesStarted = false
    private var accessibilityTimer: Timer?
    private var interactionTimer: Timer?
    private var windowTimer: Timer?
    private var eventMonitors: [Any] = []
    private var collectedPresses = 0
    private var collectedClicks = 0
    private var screenCaptureAuthorized = false
    private let screenPromptKey = "timewatcher.screenCapturePromptRequested"

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        configureStatusItem()
        ensureAutoStart()
        guard installBundledAgent() else {
            setStatus("Não foi possível preparar o coletor")
            return
        }
        guard ensureEnrollment() else {
            setStatus("Ativação pendente — abra novamente")
            return
        }
        startCoreModules()
        requestPermissionAndStart()
    }

    private func ensureAutoStart() {
        guard let executable = Bundle.main.executablePath else { return }
        let directory = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/LaunchAgents", isDirectory: true)
        let target = directory.appendingPathComponent("com.timewatcher.agent.plist")
        let definition: [String: Any] = [
            "Label": "com.timewatcher.agent",
            "ProgramArguments": [executable],
            "RunAtLoad": true,
            "ProcessType": "Background"
        ]
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let data = try PropertyListSerialization.data(fromPropertyList: definition, format: .xml, options: 0)
            try data.write(to: target, options: .atomic)
        } catch {
            setStatus("Não foi possível configurar início automático")
        }
    }

    private func installBundledAgent() -> Bool {
        guard let source = Bundle.main.url(forResource: "timewatcher_agent", withExtension: "py") else {
            return FileManager.default.fileExists(atPath: agentPath)
        }
        let destination = URL(fileURLWithPath: agentPath)
        do {
            try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
            if FileManager.default.fileExists(atPath: agentPath) {
                try FileManager.default.removeItem(at: destination)
            }
            try FileManager.default.copyItem(at: source, to: destination)
            try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: agentPath)
            return true
        } catch {
            return false
        }
    }

    private func ensureEnrollment() -> Bool {
        if FileManager.default.fileExists(atPath: configPath),
           let data = FileManager.default.contents(atPath: configPath),
           let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let token = object["token"] as? String, !token.isEmpty { return true }
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Ativar TimeWatcher"
        alert.informativeText = "Cole o código de ativação fornecido pelo administrador da sua empresa."
        alert.addButton(withTitle: "Ativar")
        alert.addButton(withTitle: "Cancelar")
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 360, height: 24))
        field.placeholderString = "Código de ativação"
        alert.accessoryView = field
        guard alert.runModal() == .alertFirstButtonReturn, !field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        let directory = URL(fileURLWithPath: configPath).deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let config: [String: Any] = ["server_url": "https://timewatcher.32-193-139-223.sslip.io", "token": field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines), "consent": true, "interval_seconds": 60, "web_interval_seconds": 5]
        guard let data = try? JSONSerialization.data(withJSONObject: config, options: [.prettyPrinted]), (try? data.write(to: URL(fileURLWithPath: configPath), options: .atomic)) != nil else { return false }
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: configPath)
        return true
    }

    private func configureStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "TW"
        item.button?.toolTip = "TimeWatcher"
        let menu = NSMenu()
        let name = NSMenuItem(title: "TimeWatcher Agent", action: nil, keyEquivalent: "")
        name.isEnabled = false
        menu.addItem(name)
        let status = NSMenuItem(title: "Starting monitoring and sync…", action: nil, keyEquivalent: "")
        status.tag = 100
        menu.addItem(status)
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Abrir painel", action: #selector(openCloudDashboard), keyEquivalent: "d"))
        menu.addItem(NSMenuItem(title: "Permissão de acessibilidade…", action: #selector(openAccessibilitySettings), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Permissão de captura…", action: #selector(openScreenRecordingSettings), keyEquivalent: ""))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Encerrar TimeWatcher", action: #selector(quit), keyEquivalent: "q"))
        item.menu = menu
        statusItem = item
    }

    private func requestPermissionAndStart() {
        screenCaptureAuthorized = CGPreflightScreenCaptureAccess()
        if !screenCaptureAuthorized && !UserDefaults.standard.bool(forKey: screenPromptKey) {
            UserDefaults.standard.set(true, forKey: screenPromptKey)
            screenCaptureAuthorized = CGRequestScreenCaptureAccess()
        }
        runSyncCycle()
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            self?.runSyncCycle()
        }
        runWebCycle()
        webTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            self?.runWebCycle()
        }
    }

    private func runSyncCycle() {
        screenCaptureAuthorized = CGPreflightScreenCaptureAccess()
        setStatus(screenCaptureAuthorized ? "Monitoring and secure sync enabled" : "Activity sync enabled — allow Screen Recording")
        runAgent(captureScreen: screenCaptureAuthorized)
    }

    private func runAgent(captureScreen: Bool) {
        let path = agentPath
        DispatchQueue.global(qos: .utility).async {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
            process.arguments = [path, captureScreen ? "--once" : "--sync-only"]
            process.standardOutput = FileHandle.nullDevice
            process.standardError = FileHandle.nullDevice
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

    private func runWebCycle() {
        guard !webSyncInFlight else { return }
        webSyncInFlight = true
        let path = agentPath
        DispatchQueue.global(qos: .utility).async {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
            process.arguments = [path, "--web-only"]
            process.standardOutput = FileHandle.nullDevice
            process.standardError = FileHandle.nullDevice
            try? process.run()
            process.waitUntilExit()
            DispatchQueue.main.async { [weak self] in self?.webSyncInFlight = false }
        }
    }

    private func startCoreModules() {
        guard activityWatchBin != nil else {
            setStatus("ActivityWatch components not found — reinstall TimeWatcher")
            return
        }
        startModule("aw-server")
        // The watchers already retry the local API while aw-server starts, so
        // launching them immediately is more reliable than a timer that can be
        // delayed by macOS privacy prompts during application startup.
        startModule("aw-watcher-afk")
        requestAccessibilityOnce()
    }

    private func requestAccessibilityOnce() {
        let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        // Start the native collectors now.  When the user grants permission
        // while TimeWatcher is open, the global monitor starts receiving input
        // without requiring a second install or a background helper process.
        startAccessibilityModules()
        if AXIsProcessTrustedWithOptions([promptKey: true] as CFDictionary) {
            return
        }
        setStatus("Accessibility permission required once")
        accessibilityTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] timer in
            guard AXIsProcessTrusted() else { return }
            timer.invalidate()
            self?.setStatus("Monitoring and secure sync enabled")
        }
    }

    private func startAccessibilityModules() {
        guard !accessibilityModulesStarted else { return }
        accessibilityModulesStarted = true
        // The bundled Python watchers run as different executables, so recent
        // macOS releases treat them as separate TCC clients.  Collect in this
        // signed TimeWatcher process instead: the permission the user grants
        // applies to the process actually receiving the global events.
        startNativeCollectors()
        setStatus("Monitoring and secure sync enabled")
    }

    // Keep the exact hostname convention used by ActivityWatch so native
    // events join the device/person already enrolled in the platform.
    private lazy var hostName: String = {
        let process = Process()
        let pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/scutil")
        process.arguments = ["--get", "LocalHostName"]
        process.standardOutput = pipe
        do {
            try process.run()
            process.waitUntilExit()
            let value = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !value.isEmpty { return value + ".local" }
        } catch { }
        return ProcessInfo.processInfo.hostName
    }()
    private var localActivityURL: URL { URL(string: "http://127.0.0.1:5600/api/0/buckets/")! }

    private func startNativeCollectors() {
        ensureBucket(id: "aw-watcher-window_\(hostName)", type: "currentwindow", client: "timewatcher-native-window")
        ensureBucket(id: "aw-watcher-input_\(hostName)", type: "os.hid.input", client: "timewatcher-native-input")
        let mask: NSEvent.EventTypeMask = [.keyDown, .leftMouseDown, .rightMouseDown, .otherMouseDown]
        if let monitor = NSEvent.addGlobalMonitorForEvents(matching: mask, handler: { [weak self] event in
            DispatchQueue.main.async {
                if event.type == .keyDown { self?.collectedPresses += 1 }
                else { self?.collectedClicks += 1 }
            }
        }) { eventMonitors.append(monitor) }
        emitWindowSample()
        windowTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.emitWindowSample() }
        interactionTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in self?.emitInteractionSample() }
    }

    private func ensureBucket(id: String, type: String, client: String) {
        var request = URLRequest(url: localActivityURL.appendingPathComponent(id))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["id": id, "type": type, "client": client, "hostname": hostName])
        URLSession.shared.dataTask(with: request).resume()
    }

    private func emitActivity(bucket: String, duration: TimeInterval, data: [String: Any]) {
        var request = URLRequest(url: localActivityURL.appendingPathComponent(bucket).appendingPathComponent("events"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let formatter = ISO8601DateFormatter()
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["timestamp": formatter.string(from: Date()), "duration": duration, "data": data])
        URLSession.shared.dataTask(with: request).resume()
    }

    private func emitWindowSample() {
        let application = NSWorkspace.shared.frontmostApplication
        let name = application?.localizedName ?? "Não identificado"
        emitActivity(bucket: "aw-watcher-window_\(hostName)", duration: 5, data: ["app": name, "title": ""])
    }

    private func emitInteractionSample() {
        let presses = collectedPresses
        let clicks = collectedClicks
        collectedPresses = 0
        collectedClicks = 0
        guard presses > 0 || clicks > 0 else { return }
        emitActivity(bucket: "aw-watcher-input_\(hostName)", duration: 10, data: ["presses": presses, "clicks": clicks])
    }

    private func startModule(_ name: String) {
        guard let activityWatchBin else {
            setStatus("ActivityWatch components not found")
            return
        }
        if moduleIsRunning(name) { return }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "\(activityWatchBin)/\(name)")
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            modules.append(process)
        } catch {
            setStatus("Unable to start \(name)")
        }
    }

    private func moduleIsRunning(_ name: String) -> Bool {
        let check = Process()
        check.executableURL = URL(fileURLWithPath: "/usr/bin/pgrep")
        check.arguments = ["-x", name]
        check.standardOutput = FileHandle.nullDevice
        check.standardError = FileHandle.nullDevice
        do {
            try check.run()
            check.waitUntilExit()
            return check.terminationStatus == 0
        } catch {
            return false
        }
    }

    private func setStatus(_ title: String) {
        statusItem?.menu?.item(withTag: 100)?.title = title
    }

    @objc private func openCloudDashboard() {
        NSWorkspace.shared.open(URL(string: "https://timewatcher.32-193-139-223.sslip.io")!)
    }

    @objc private func openScreenRecordingSettings() {
        NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")!)
    }

    @objc private func openAccessibilitySettings() {
        NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!)
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }

    func applicationWillTerminate(_ notification: Notification) {
        timer?.invalidate()
        webTimer?.invalidate()
        accessibilityTimer?.invalidate()
        interactionTimer?.invalidate()
        windowTimer?.invalidate()
        eventMonitors.forEach { NSEvent.removeMonitor($0) }
        for process in modules where process.isRunning { process.terminate() }
    }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.run()
