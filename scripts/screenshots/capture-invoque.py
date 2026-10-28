#!/usr/bin/env python3
"""Render Invoque's real results panel with inert in-memory fixtures and no search services."""
from pathlib import Path
import subprocess, tempfile, sys
site=Path(__file__).resolve().parents[2]
repo=Path(sys.argv[1]).resolve()
sdk='/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk'
with tempfile.TemporaryDirectory(prefix='invoque-capture-') as d:
    work=Path(d)
    panel=(repo/'Invoque/Panel/PanelView.swift').read_text().replace('import PictKit\n','')
    # These branches are nil in the fixture; omit their unrelated service-driven cards.
    a=panel.index('            if let request = model.permissionRequest {')
    b=panel.index('\n            Divider().padding(.horizontal, 12)',a)
    panel=panel[:a]+'            resultList\n'+panel[b:]
    a=panel.index('/// The first-run consent card')
    b=panel.index('/// Layout constants for the card',a)
    panel=panel[:a]+panel[b:]
    (work/'PanelView.swift').write_text(panel)
    resultrow=(repo/'Invoque/Panel/PanelModel.swift').read_text().split('/// View model for the launcher panel')[0].replace('import PictKit\n','')
    icons=(repo/'Invoque/Icons/InvoqueIcons.swift').read_text()
    icons=icons[icons.index('extension Item.Icon {'):]
    (work/'Fixtures.swift').write_text('import SwiftUI\nimport Combine\n'+resultrow+'''
enum IconTarget { case file(URL); case application(bundleURL: URL, bundleIdentifier:String?) }
'''+icons+'''
final class Preferences: ObservableObject {
    let panelMaterial=PanelMaterial.solid
    let tintHex="#F2F2F7"
    let gradientHex="#F2F2F7"
    let gradientAngle=0.0
    let backgroundOpacity=1.0
    let highlightHex="#0A84FF"
    let highlightOpacity=0.25
    let labelHex="#111111"
    let panelTypeface=PanelTypeface.system
    let panelCornerRadius=16.0
    let highlightCornerRadius=8.0
    let adaptiveAccent=false
    let decorationStyle=DecorationStyle.none
    let decorationPosition=DecorationPosition.topTrailing
    let decorationOpacity=1.0
    let decorationSize=10.0
    let crtEnabled=false
    let crtIntensity=0.5
}
final class PanelModel: ObservableObject {
    @Published var query=""
    @Published var results:[ResultRow]=[]
    @Published var selectedRow:ResultRow?
    var iconResolver:((IconTarget)->NSImage?)?=nil
    let permissionRequest:Bool?=nil
    let systemActionConfirmation:Bool?=nil
    let makerIsActive=false
    let fileScanIsPending=false
    let calculationIsPending=false
    let fileSearchIsActive=false
    let webSearchIsActive=false
    let fileSearchTextIsBlank=false
    let webSearchTextIsBlank=false
    let selectedRevealURL:URL?=nil
    var highlightQuery:String? { query.isEmpty ? nil : query }
    func isPinned(_ row:ResultRow)->Bool { false }
    func canManage(_ row:ResultRow)->Bool { false }
    func select(_ row:ResultRow) { selectedRow=row }
    func moveSelection(by offset:Int) {}
    func submit(commandModifier:Bool=false,detachesPendingScan:Bool=true) {}
    func togglePin(on row:ResultRow)->String? { nil }
    func toggleBlock(on row:ResultRow)->String? { nil }
}
enum HUD { static func show(_ message:String,typeface:PanelTypeface) {} }
''')
    (work/'Capture.swift').write_text('''import AppKit
import SwiftUI
@main @MainActor enum Capture {
    static func main() throws {
        let model=PanelModel()
        model.results=[
            ResultRow(id:"app:sample-finder",title:"Finder",subtitle:"Application",icon:.symbol("folder.fill"),action:.copyText(""),sourceType:.app),
            ResultRow(id:"app:sample-calculator",title:"Calculator",subtitle:"Application",icon:.symbol("plus.forwardslash.minus"),action:.copyText(""),sourceType:.app),
            ResultRow(id:"cmd:sample-json",title:"Format Clipboard JSON",subtitle:"Invoque command",icon:.symbol("terminal"),action:.copyText(""),sourceType:.command),
            ResultRow(id:"app:sample-safari",title:"Safari",subtitle:"Application",icon:.symbol("safari"),action:.copyText(""),sourceType:.app)
        ]
        model.selectedRow=model.results[1]
        try captureSwiftUI(PanelView(model:model,preferences:Preferences()),width:720,height:360,to:CommandLine.arguments[1],title:"Invoque")
    }
}
''')
    paths=['Search/Item.swift','Model/PanelTypeface.swift','Model/PanelMaterial.swift','Model/ColorHex.swift','Model/RGBA8.swift','Model/DecorationStyle.swift','Model/DecorationPosition.swift','Model/AccessibilityDisplaySettings.swift','Panel/ResultRowView.swift','Panel/AdaptiveAccent.swift','Panel/ScrollSelectionIntoView.swift','Panel/PanelBackground.swift','Panel/VisualEffectBlur.swift','Panel/PanelDecoration.swift','Panel/BoingBallDecoration.swift','Panel/CRTScreenOverlay.swift','Panel/LauncherPanel.swift','Icons/WorkspaceIcons.swift']
    files=[repo/'Invoque'/p for p in paths]+[work/'PanelView.swift',work/'Fixtures.swift',work/'Capture.swift',site/'scripts/screenshots/capture-support.swift']
    subprocess.run(['swiftc','-sdk',sdk,'-swift-version','5','-parse-as-library',*[str(p) for p in files],'-o',str(work/'capture')],check=True)
    subprocess.run([str(work/'capture'),str(site/'catalogue/assets/invoque.png')],check=True)
