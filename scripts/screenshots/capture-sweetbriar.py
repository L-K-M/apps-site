#!/usr/bin/env python3
"""Capture Sweetbriar's production AppKit message list with an inert synthetic bridge."""
from pathlib import Path
import subprocess, tempfile, sys
site=Path(__file__).resolve().parents[2]
repo=Path(sys.argv[1]).resolve()
sdk='/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk'
types=(repo/'apps/macos/SweetbriarBridge/Types.swift').read_text()
listrow=types[types.index('public struct ListRow:'):types.index('/// One page of a window')]
with tempfile.TemporaryDirectory(prefix='sweetbriar-capture-') as d:
    work=Path(d)
    (work/'Bridge.swift').write_text('import Foundation\n'+listrow+'''
@MainActor public final class ListWindowModel {
    public static let pageSize=200
    public var onPagesDelivered: @MainActor ([Int])->Void = { _ in }
    public var onIndexChanged: @MainActor ()->Void = {}
    public var onSelectionChanged: @MainActor (Set<Int64>)->Void = { _ in }
    public let hasExactIndex=true
    private let rows: [ListRow]
    public init(rows:[ListRow]) { self.rows=rows }
    public var count:Int { rows.count }
    public func occurrenceID(at rank:Int)->Int64? { rows.indices.contains(rank) ? rows[rank].occurrenceId : nil }
    public func index(of id:Int64)->Int? { rows.firstIndex { $0.occurrenceId==id } }
    public func row(at rank:Int)->ListRow? { rows.indices.contains(rank) ? rows[rank] : nil }
    public func setVisible(_ range:Range<Int>) {}
    public func select(_ ids:Set<Int64>) {}
}
''')
    subprocess.run(['swiftc','-sdk',sdk,'-emit-library','-emit-module','-module-name','SweetbriarBridge',str(work/'Bridge.swift'),'-o',str(work/'libSweetbriarBridge.dylib')],check=True)
    (work/'Capture.swift').write_text('''import AppKit
import SweetbriarBridge
@main @MainActor enum Capture {
    static func main() throws {
        let samples=[
            ("Garden Club", "Autumn seed exchange", "Bring a few spare seeds for our next sample gathering."),
            ("Example Observatory", "Stargazing evening", "The telescope workshop starts on Saturday at 18:00."),
            ("Workshop Team", "A sketch for the new bookshelf", "Here is the revised drawing for the sample reading corner."),
            ("Example Library", "Your reading list", "Three new books have been added to the sample collection."),
            ("Walking Group", "A trail by the river", "We found a pleasant route for the next weekend walk."),
            ("Sample Newsletter", "Notes from the greenhouse", "This month we look at seedlings, soil and small experiments."),
            ("Garden Club", "Thank you for joining", "We look forward to seeing your ideas at the next meeting."),
            ("Demo Workshop", "Welcome to the sample archive", "These invented messages demonstrate the local mail archive.")
        ]
        let rows=samples.enumerated().map { i,s in
            ListRow(occurrenceId:Int64(i+1),messageId:Int64(i+1),accountId:"sample-mail",mailboxId:1,
                    sortDate:1793145600000-Int64(i)*86400000,sender:s.0,subject:s.1,snippet:s.2,
                    unread:i<3,flagged:i==1,hasAttachments:i==2,tags:[])
        }
        let model=ListWindowModel(rows:rows)
        let list=AppKitPrototypeList(model:model,formatter:MessageRowFormatter(),accountMarker:.hidden)
        model.onIndexChanged()
        try captureView(list,size:NSSize(width:840,height:450),to:CommandLine.arguments[1],title:"Sweetbriar")
    }
}
''')
    base=repo/'apps/macos/Sweetbriar'
    files=[base/'PrototypeList.swift',base/'AppKitPrototypeList.swift',base/'MessageRowPresentation.swift',site/'scripts/screenshots/capture-support.swift',work/'Capture.swift']
    subprocess.run(['swiftc','-sdk',sdk,'-parse-as-library','-I',str(work),'-L',str(work),'-lSweetbriarBridge','-Xlinker','-rpath','-Xlinker',str(work),*[str(p) for p in files],'-o',str(work/'capture')],check=True)
    subprocess.run([str(work/'capture'),str(site/'catalogue/assets/sweetbriar.png')],check=True)
