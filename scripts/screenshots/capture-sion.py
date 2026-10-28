#!/usr/bin/env python3
"""Build Sion and capture its actual document UI from a synthetic Mermaid graph."""
from pathlib import Path
import subprocess, tempfile, sys
site = Path(__file__).resolve().parents[2]
repo = Path(sys.argv[1]).resolve()
subprocess.run(['swift','build'],cwd=repo,check=True)
binpath=Path(subprocess.check_output(['swift','build','--show-bin-path'],cwd=repo,text=True).strip())
with tempfile.TemporaryDirectory(prefix='sion-capture-') as d:
    work=Path(d)
    (work/'Capture.swift').write_text('''import AppKit
import SionCore
import SionKit
import ScreenCaptureKit
@main @MainActor enum Capture {
    static func main() throws {
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        app.finishLaunching()
        app.appearance = NSAppearance(named: .aqua)
        let source = """
        flowchart TD
          A[Collect ideas] --> B[Make a prototype]
          B --> C{Test the idea}
          C --> D[Refine the design]
          C --> E[Share the result]
        """
        let elements = MermaidImporter.elements(from: source, centeredAt: SionPoint(x: 500, y: 400))
        precondition(!elements.isEmpty)
        let package = SionPackage(document: SionDocument(title: "Sample creative workflow", scene: SionScene(elements: elements)))
        let data = try SionArchive.encode(package: package, intent: .manual, generator: SionArchiveGenerator(name: "Sion", version: "synthetic capture")).data
        let document = SionDrawingDocument()
        try document.read(from: data, ofType: SionDrawingDocument.typeIdentifier)
        document.makeWindowControllers()
        let controller = document.windowControllers[0]
        controller.showWindow(nil)
        let window = controller.window!
        window.appearance = NSAppearance(named: .aqua)
        window.setContentSize(NSSize(width: 1040, height: 760))
        window.title = "Sample creative workflow"
        window.makeKeyAndOrderFront(nil)
        app.activate(ignoringOtherApps: true)
        _ = controller.perform(NSSelectorFromString("zoomToFit:"), with: nil)
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
                try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
            } catch { failure = error }
            finished = true
        }
        let deadline = Date(timeIntervalSinceNow: 20)
        while !finished && Date() < deadline { RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.05)) }
        if let failure { throw failure }
        guard finished else { throw NSError(domain: "OwnWindowCapture", code: 3) }
        window.orderOut(nil)
    }
}
''')
    subprocess.run(['swiftc','-target','arm64-apple-macos14.4','-parse-as-library','-I',str(binpath),str(work/'Capture.swift'),'-L',str(binpath),'-lSionKit','-lSionCore','-o',str(work/'capture')],check=True)
    subprocess.run([str(work/'capture'),str(site/'catalogue/assets/sion.png')],check=True)
