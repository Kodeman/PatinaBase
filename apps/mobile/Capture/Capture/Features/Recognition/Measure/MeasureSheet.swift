//  MeasureSheet.swift
//  Capture
//
//  N3 · Measure — AR & manual. Drops AR endpoints for a width/height/depth read
//  (source .arkit), or lets the designer type a value off the tape (source
//  .manual). Devices without LiDAR/AR — and the simulator — fall straight to
//  manual entry so the field never disappears (R-fallback).

import SwiftUI
import UIKit
import CaptureKit

struct MeasureSheet: View {
    let specimenID: UUID
    let store: CaptureStore
    let measureService: any MeasureService
    let analytics: any CaptureAnalytics
    let coordinator: CaptureCoordinator?

    private static let axes: [MeasurementAxis] = [.width, .height, .depth]

    @State private var values: [MeasurementAxis: Double] = [:]   // millimetres
    @State private var sources: [MeasurementAxis: MeasureSource] = [:]
    @State private var selectedAxis: MeasurementAxis = .width
    @State private var manualMode = false
    @State private var manualText: [MeasurementAxis: String] = [:]

    var body: some View {
        RecognitionSheetLayout {
            RecognitionHeader(eyebrow: "Measure", title: "Dimensions",
                              onClose: { coordinator?.dismissSheet() })

            if manualMode || !measureService.isARSupported {
                manualEntry
            } else {
                arEntry
            }

            summaryCard

            RecognitionActionBar(
                secondaryTitle: secondaryTitle,
                primaryTitle: "Add dimensions",
                primaryEnabled: hasAnyValue,
                onSecondary: { toggleMode() },
                onPrimary: { commit() }
            )
            Spacer(minLength: 0)
        }
        .accessibilityIdentifier(CaptureScreenID.n3Measure.rawValue)
        .onAppear {
            manualMode = !measureService.isARSupported
            analytics.screen("N3.measure")
        }
    }

    // MARK: - AR entry (device)

    @ViewBuilder private var arEntry: some View {
        #if !targetEnvironment(simulator)
        VStack(alignment: .leading, spacing: 12) {
            ZStack(alignment: .bottom) {
                ARMeasureView { mm in
                    values[selectedAxis] = mm
                    sources[selectedAxis] = .arkit
                }
                .frame(height: 240)
                .clipShape(RoundedRectangle(cornerRadius: 18))
                Text(activeAxisHint)
                    .font(CaptureType.monoBody)
                    .foregroundStyle(CaptureColor.paper)
                    .padding(8)
                    .background(Capsule().fill(CaptureColor.ink.opacity(0.6)))
                    .padding(.bottom, 14)
            }
            axisPicker
        }
        #else
        manualEntry
        #endif
    }

    private var axisPicker: some View {
        HStack(spacing: 8) {
            ForEach(Self.axes, id: \.self) { axis in
                let active = axis == selectedAxis
                Button { selectedAxis = axis } label: {
                    Text(axis.rawValue.capitalized)
                        .font(CaptureType.monoSmall)
                        .foregroundStyle(active ? CaptureColor.paper3 : CaptureColor.ink2)
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(Capsule().fill(active ? CaptureColor.brass : CaptureColor.paper2))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var activeAxisHint: String {
        if let mm = values[selectedAxis] {
            return "\(MeasureUnit.inchLabel(millimeters: mm)) · \(selectedAxis.rawValue)"
        }
        return "Drag the endpoints · \(selectedAxis.rawValue)"
    }

    // MARK: - Manual entry

    private var manualEntry: some View {
        RecognitionCard {
            Text("Type the dimensions (inches)")
                .font(CaptureType.eyebrow).textCase(.uppercase)
                .foregroundStyle(CaptureColor.inkSoft)
            ForEach(Self.axes, id: \.self) { axis in
                HStack {
                    Text(axis.rawValue.uppercased())
                        .font(CaptureType.eyebrow)
                        .foregroundStyle(CaptureColor.inkSoft)
                        .frame(width: 64, alignment: .leading)
                    TextField("—", text: bindingFor(axis))
                        .font(CaptureType.body)
                        .foregroundStyle(CaptureColor.ink)
                        .keyboardType(.decimalPad)
                    Text("in").font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
                }
                .padding(.vertical, 6)
                .overlay(alignment: .bottom) { Rectangle().fill(CaptureColor.line).frame(height: 1) }
            }
        }
    }

    private func bindingFor(_ axis: MeasurementAxis) -> Binding<String> {
        Binding(
            get: { manualText[axis] ?? "" },
            set: { newValue in
                manualText[axis] = newValue
                if let inches = Double(newValue.trimmingCharacters(in: .whitespaces)), inches > 0 {
                    values[axis] = MeasureUnit.millimeters(fromInches: inches)
                    sources[axis] = .manual
                } else {
                    values[axis] = nil
                    sources[axis] = nil
                }
            }
        )
    }

    // MARK: - Summary

    private var summaryCard: some View {
        RecognitionCard {
            Text("Measured")
                .font(CaptureType.eyebrow).textCase(.uppercase)
                .foregroundStyle(CaptureColor.inkSoft)
            ForEach(Self.axes, id: \.self) { axis in
                HStack {
                    Text(axis.rawValue.uppercased())
                        .font(CaptureType.eyebrow)
                        .foregroundStyle(CaptureColor.inkSoft)
                    Spacer()
                    if let mm = values[axis] {
                        if let src = sources[axis] {
                            ProvenanceBadge(src == .arkit ? .measure : .manual)
                        }
                        Text(MeasureUnit.inchLabel(millimeters: mm))
                            .font(CaptureType.bodyEmph)
                            .foregroundStyle(CaptureColor.brass)
                    } else {
                        Text("—").font(CaptureType.body).foregroundStyle(CaptureColor.inkSoft)
                    }
                }
                .padding(.vertical, 6)
                .overlay(alignment: .bottom) { Rectangle().fill(CaptureColor.line).frame(height: 1) }
            }
        }
    }

    // MARK: - Actions

    private var hasAnyValue: Bool { values.values.contains(where: { $0 > 0 }) }

    private var secondaryTitle: String {
        guard measureService.isARSupported else { return "Clear" }
        return manualMode ? "Use AR" : "Type instead"
    }

    private func toggleMode() {
        if !measureService.isARSupported {
            values.removeAll(); sources.removeAll(); manualText.removeAll()
            return
        }
        manualMode.toggle()
    }

    private func commit() {
        guard let specimen = store.specimen(id: specimenID) else { return }
        for axis in Self.axes {
            guard let mm = values[axis], mm > 0 else { continue }
            let source = sources[axis] ?? .manual
            specimen.addMeasurement(axis: axis, millimeters: mm, source: source)
        }
        try? store.save()
        analytics.event("N3.add-dimensions", ["count": String(values.count)])
        coordinator?.present(.specimenSheet(specimenID))
    }
}

#if DEBUG
import CaptureKitMocks

#Preview("N3 · Measure") {
    // swiftlint:disable:next force_try
    let store = try! CaptureStore.inMemory()
    let specimen = store.newDraft()
    return MeasureSheet(
        specimenID: specimen.id,
        store: store,
        measureService: MockMeasureService(),
        analytics: MockCaptureAnalytics(),
        coordinator: CaptureCoordinator()
    )
}
#endif
