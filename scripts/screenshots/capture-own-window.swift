import AppKit
import ScreenCaptureKit

/// Captures only this process's supplied synthetic window. Other apps, the
/// desktop and the menu bar are never included; no screen-recording grant is used.
@available(macOS 14.4, *)
@MainActor
func captureOwnView(_ view: NSView, size: NSSize, to destination: String, title: String, styleMask: NSWindow.StyleMask = [.titled, .closable]) throws {
    NSApplication.shared.setActivationPolicy(.accessory)
    NSApp.finishLaunching()
    NSApp.appearance = NSAppearance(named: .aqua)
    let window = NSWindow(contentRect: NSRect(origin: .zero, size: size), styleMask: styleMask, backing: .buffered, defer: false)
    window.isReleasedWhenClosed = false
    window.title = title
    window.appearance = NSAppearance(named: .aqua)
    if let controller = view.nextResponder as? NSViewController {
        window.contentViewController = controller
    } else {
        window.contentView = view
    }
    view.frame = NSRect(origin: .zero, size: size)
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    RunLoop.main.run(until: Date(timeIntervalSinceNow: 1))
    var finished = false
    var failure: Error?
    Task { @MainActor in
        do {
            let content = try await SCShareableContent.currentProcess
            guard let ownWindow = content.windows.first(where: { $0.windowID == CGWindowID(window.windowNumber) }) else {
                throw NSError(domain: "OwnWindowCapture", code: 1)
            }
            let filter = SCContentFilter(desktopIndependentWindow: ownWindow)
            let configuration = SCStreamConfiguration()
            configuration.width = Int(ownWindow.frame.width)
            configuration.height = Int(ownWindow.frame.height)
            configuration.showsCursor = false
            configuration.ignoreShadowsSingleWindow = true
            let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: configuration)
            let bitmap = NSBitmapImageRep(cgImage: image)
            guard let png = bitmap.representation(using: .png, properties: [:]) else { throw NSError(domain: "OwnWindowCapture", code: 2) }
            try png.write(to: URL(fileURLWithPath: destination))
        } catch { failure = error }
        finished = true
    }
    let deadline = Date(timeIntervalSinceNow: 20)
    while !finished && Date() < deadline { RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.05)) }
    window.orderOut(nil)
    if let failure { throw failure }
    guard finished else { throw NSError(domain: "OwnWindowCapture", code: 3) }
}
