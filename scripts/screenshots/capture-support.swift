import AppKit
import SwiftUI

/// Renders only the supplied app view. No desktop pixels are read.
@MainActor
func captureView(_ view: NSView, size: NSSize, to destination: String, title: String = "") throws {
    NSApplication.shared.setActivationPolicy(.accessory)
    NSApp.appearance = NSAppearance(named: .aqua)
    let window = NSWindow(contentRect: NSRect(origin: .zero, size: size),
                          styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
    window.title = title
    window.isReleasedWhenClosed = false
    window.appearance = NSAppearance(named: .aqua)
    window.contentView = view
    view.frame = NSRect(origin: .zero, size: size)
    view.wantsLayer = true
    view.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    RunLoop.main.run(until: Date(timeIntervalSinceNow: 1))
    view.layoutSubtreeIfNeeded()
    func prepareMaterials(_ child: NSView) {
        if let effect = child as? NSVisualEffectView {
            effect.blendingMode = .withinWindow
            effect.state = .active
        }
        child.subviews.forEach(prepareMaterials)
    }
    prepareMaterials(view)
    view.displayIfNeeded()
    guard let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) else {
        throw NSError(domain: "Capture", code: 1)
    }
    view.cacheDisplay(in: view.bounds, to: bitmap)
    guard let png = bitmap.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "Capture", code: 2)
    }
    try png.write(to: URL(fileURLWithPath: destination))
    window.orderOut(nil)
}

@MainActor
func captureSwiftUI<V: View>(_ view: V, width: CGFloat, height: CGFloat, to destination: String, title: String = "") throws {
    let hosting = NSHostingView(rootView: view.environment(\.colorScheme, .light).background(Color(nsColor: .windowBackgroundColor)))
    try captureView(hosting, size: NSSize(width: width, height: height), to: destination, title: title)
}
