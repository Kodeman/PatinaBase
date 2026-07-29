//  V1SessionTrayScreen.swift
//  Capture
//
//  V1 · Session tray. Swiping up from the viewfinder reveals everything captured
//  on this visit, grouped by venue with each record's status. The hub for
//  finishing a sourcing run in one sitting: tap a row to open its detail (V3),
//  step through them (V2), or batch-route the lot (S1).

import Foundation
import SwiftUI
import CaptureKit
import PatinaDesignKit

struct V1SessionTrayScreen: View {
    let store: CaptureStore
    let session: any SessionProviding
    let coordinator: CaptureCoordinator

    @State private var items: [Specimen] = []
    private let sessionContext = CaptureSessionContextStore.shared

    private var groups: [(venue: String, items: [Specimen])] {
        let grouped = Dictionary(grouping: items) { specimen in
            specimen.venue?.placemarkName ?? "This visit"
        }
        return grouped
            .map { (venue: $0.key, items: $0.value.sorted { $0.createdAt > $1.createdAt }) }
            .sorted { ($0.items.first?.createdAt ?? .distantPast) > ($1.items.first?.createdAt ?? .distantPast) }
    }

    var body: some View {
        ZStack {
            CaptureColor.paper3.ignoresSafeArea()

            if items.isEmpty {
                emptyState
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        Text("This visit")
                            .font(CaptureType.display)
                            .foregroundStyle(CaptureColor.ink)
                            .padding(.top, 4)

                        ForEach(groups, id: \.venue) { group in
                            venueSection(group.venue, group.items)
                        }
                    }
                    .padding(20)
                    .padding(.bottom, 96)
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            if !items.isEmpty { footer }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("End visit", action: endVisit)
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
        }
        .accessibilityIdentifier(CaptureScreenID.v1SessionTray.rawValue)
        .onAppear(perform: reload)
    }

    private func venueSection(_ venue: String, _ specimens: [Specimen]) -> some View {
        let doneCount = specimens.filter { $0.destination != .undecided }.count
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("\(venue.uppercased()) · \(specimens.count) CAPTURES")
                    .font(CaptureType.eyebrow)
                    .foregroundStyle(CaptureColor.inkSoft)
                Spacer()
                Text("Done \(doneCount)")
                    .font(CaptureType.eyebrow)
                    .foregroundStyle(CaptureColor.success)
            }

            VStack(spacing: 0) {
                ForEach(specimens, id: \.id) { specimen in
                    if specimen.id != specimens.first?.id {
                        Divider().background(CaptureColor.line)
                    }
                    row(specimen)
                }
            }
            .routeCard()
        }
    }

    private func row(_ specimen: Specimen) -> some View {
        Button {
            coordinator.navigate(to: .specimen(specimen.id))
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(specimen.title ?? "Untitled capture")
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(CaptureColor.ink)
                    Text("\(RouteFormat.time(specimen.createdAt)) · \(RouteFormat.descriptor(for: specimen).uppercased())")
                        .font(CaptureType.monoSmall)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
                Spacer()
                RouteStatusChip(kind: RouteFormat.status(for: specimen))
                Image(systemName: "chevron.right")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.line2)
            }
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var footer: some View {
        HStack(spacing: 10) {
            RouteActionButton("Review each", systemImage: "rectangle.stack", kind: .secondary) {
                coordinator.present(.cullDeck)
            }
            RouteActionButton("Route all \(items.count)", systemImage: "arrow.up.forward", kind: .primary) {
                if let first = items.first { coordinator.present(.assignVenue(first.id)) }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(.ultraThinMaterial)
    }

    private var emptyState: some View {
        PatinaEmptyState(icon: "tray",
                         title: "Nothing captured yet",
                         message: "Captures from this visit gather here.")
    }

    private func reload() {
        let context = sessionContext.current(identity: identity)
        guard let owner = CaptureOwnerIdentity(
            userID: session.userID,
            workspaceID: session.workspaceID
        ) else {
            items = []
            return
        }
        items = store.session(visitID: context.visitID, owner: owner)
    }

    private func endVisit() {
        _ = sessionContext.endVisit(identity: identity)
        items = []
        coordinator.popToRoot()
    }

    private var identity: CaptureSessionIdentity {
        CaptureSessionIdentity(
            userID: session.userID,
            workspaceID: session.workspaceID)
    }
}

#if DEBUG
import CaptureKitMocks

#Preview {
    let demo = RoutePreviewData.make()
    return NavigationStack {
        V1SessionTrayScreen(
            store: demo.store, session: MockSessionProviding(),
            coordinator: CaptureCoordinator())
    }
}
#endif
