import AppKit
import SwiftUI
import CoreographyDrivers
@testable import CoreographyKit
@testable import CoreographyServices

private actor SyntheticHost: HostSampleReading {
    let clock = UUID()
    var reads: UInt64 = 0
    var user: UInt64 = 0
    var idle: UInt64 = 0
    func read() async -> RawHostSnapshot {
        reads += 1
        let wave = UInt64(15 + 12 * (sin(Double(reads) / 6) + 1))
        user += wave
        idle += 100 - wave
        return RawHostSnapshot(clockID: clock, monotonicNanoseconds: reads * 1_000_000_000,
            wallTime: Date(timeIntervalSince1970: 1793181600).addingTimeInterval(Double(reads)),
            inventory: HostInventory(operatingSystem: "macOS · Sample Mac", architecture: "arm64",
                                     logicalCPUCount: 8, physicalMemoryBytes: 16_000_000_000),
            cpu: .success(ProcessorTicks(user: user, system: reads * 8, idle: idle, nice: 0)),
            memory: .success(MemoryPages(active: 1_000_000, inactive: 500_000, speculative: 0,
                wired: 400_000, compressed: 250_000, compressorContents: 400_000,
                purgeable: 0, fileBacked: 300_000, pageIns: reads, swapIns: 0, swapOuts: 0,
                pageSizeBytes: 4096)),
            swap: .success(SwapUsage(totalBytes: 2_000_000_000, usedBytes: 0)),
            memoryPressure: .success(.normal), thermalPressure: .success(.nominal))
    }
}

@main struct Capture {
    @MainActor static func main() throws {
        let monitor = try SystemMonitor(driver: SyntheticHost())
        let model = DashboardModel(monitor: monitor, interval: .milliseconds(15))
        model.start()
        RunLoop.main.run(until: Date(timeIntervalSinceNow: 2))
        model.toggleDisplayHold()
        for lane in [LaneKind.gpu, .power, .disk, .network, .thermal] {
            model.laneLayout.set(lane, LaneVisibility.hidden)
        }
        let view = DashboardView(model: model, hud: HUDController(model: model))
        try captureSwiftUI(view.frame(width: 1120, height: 600), width: 1120, height: 600, to: CommandLine.arguments[1], title: "Coreography")
        model.stop()
    }
}
