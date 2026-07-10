//  ArrivingPOsScreen.swift
//  Capture · Wave G (Receiving / goods-in)
//
//  G1 · Arriving POs (route `.receiving`, id `g1Arriving`). Lists in-flight
//  purchase orders (in_production/shipped with a confirmed ETA) so a designer
//  on-site can jump straight into an inspection. Real data via
//  `container.receiving.arrivingPOs()` — no local caching, `.refreshable` pulls
//  fresh, and the list also reloads whenever the `.receivingInspection` sheet
//  presented from a row closes (a submitted inspection can move a PO off this
//  list or change its status chip).

import SwiftUI
import CaptureKit

@Observable
@MainActor
final class ArrivingPOsViewModel {
    private let receiving: any ReceivingService
    var pos: [FieldArrivingPO] = []
    var isLoading = false
    var error: String?

    init(receiving: any ReceivingService) {
        self.receiving = receiving
    }

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            pos = try await receiving.arrivingPOs()
        } catch {
            self.error = "Couldn't load arriving deliveries."
        }
    }
}

struct ArrivingPOsScreen: View {
    let analytics: any CaptureAnalytics
    let coordinator: CaptureCoordinator

    @State private var viewModel: ArrivingPOsViewModel

    init(receiving: any ReceivingService, analytics: any CaptureAnalytics, coordinator: CaptureCoordinator) {
        self.analytics = analytics
        self.coordinator = coordinator
        _viewModel = State(initialValue: ArrivingPOsViewModel(receiving: receiving))
    }

    var body: some View {
        content
            .background(CaptureColor.paper)
            .navigationTitle("Receiving")
            .navigationBarTitleDisplayMode(.large)
            .task {
                await viewModel.load()
                analytics.screen(CaptureScreenID.g1Arriving.rawValue)
            }
            .onChange(of: coordinator.sheet) { oldValue, newValue in
                // A submitted inspection can change a PO's status/visibility —
                // reload once the inspection sheet this screen presented closes.
                if oldValue != nil, newValue == nil {
                    Task { await viewModel.load() }
                }
            }
            .accessibilityIdentifier(CaptureScreenID.g1Arriving.rawValue)
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.pos.isEmpty {
            ProgressView()
                .tint(CaptureColor.verdigris)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let message = viewModel.error, viewModel.pos.isEmpty {
            errorState(message)
        } else if viewModel.pos.isEmpty {
            emptyState
        } else {
            list
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(viewModel.pos) { po in
                    Button {
                        coordinator.present(.receivingInspection(poID: po.id))
                    } label: {
                        poRow(po)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(20)
        }
        .refreshable { await viewModel.load() }
    }

    private func poRow(_ po: FieldArrivingPO) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(po.vendorName ?? "Vendor")
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.ink)
                Spacer()
                statusChip(po.status)
            }
            if let projectName = po.projectName {
                Text(projectName)
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
            HStack(spacing: 14) {
                if let poNumber = po.poNumber {
                    Text("PO \(poNumber)")
                        .font(CaptureType.monoSmall)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
                if let eta = po.eta {
                    Text("ETA \(CaptureDates.mediumDate(eta))")
                        .font(CaptureType.monoSmall)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(CaptureColor.paper3, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(CaptureColor.line, lineWidth: 1))
    }

    private func statusChip(_ status: String) -> some View {
        let color: Color = status == "shipped" ? CaptureColor.success : CaptureColor.warning
        return Text(status.replacingOccurrences(of: "_", with: " ").capitalized)
            .font(CaptureType.eyebrow)
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.12), in: Capsule())
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "shippingbox")
                .font(CaptureType.display)
                .foregroundStyle(CaptureColor.inkSoft)
            Text("Nothing arriving right now.")
                .font(CaptureType.title2)
                .foregroundStyle(CaptureColor.ink)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 10) {
            Text(message)
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.inkSoft)
                .multilineTextAlignment(.center)
            Button("Try again") { Task { await viewModel.load() } }
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.verdigris)
        }
        .padding(.horizontal, 32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
