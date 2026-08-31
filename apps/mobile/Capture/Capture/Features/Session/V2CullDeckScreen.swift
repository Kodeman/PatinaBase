//  V2CullDeckScreen.swift
//  Capture
//
//  V2 · Session review — keep / cull. A fast, tactile triage of the session as a
//  card deck: swipe right to keep, left to cull a bad frame, tap to open and fix
//  (V3). Distinct haptics for keep vs cull. Culls go to Recently Deleted —
//  recoverable, never an instant hard delete — so here they only leave the deck.

import SwiftUI
import CaptureKit

private enum CullAction: Equatable { case keep, cull }

struct V2CullDeckScreen: View {
    let store: CaptureStore
    let sync: any CaptureSyncService
    let session: any SessionProviding
    let coordinator: CaptureCoordinator
    private let sessionContext = CaptureSessionContextStore.shared

    @State private var deck: [Specimen] = []
    @State private var index = 0
    @State private var drag: CGSize = .zero
    @State private var lastAction: CullAction = .keep
    @State private var actionTick = 0
    @State private var isSendingAll = false
    @State private var bulkRouteError: String?

    private let threshold: CGFloat = 120

    private var current: Specimen? { index < deck.count ? deck[index] : nil }

    var body: some View {
        VStack(spacing: 16) {
            header

            ZStack {
                if current != nil {
                    // Up to three cards; deepest drawn first, top card drawn last.
                    let visible = Array(deck[index...].prefix(3))
                    ForEach(visible.reversed(), id: \.id) { specimen in
                        let depth = visible.firstIndex { $0.id == specimen.id } ?? 0
                        cardView(specimen, depth: depth, isTop: depth == 0)
                    }
                } else {
                    completionCard
                }
            }
            .frame(maxHeight: .infinity)
            .padding(.horizontal, 8)

            footer
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(CaptureColor.paper3)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .accessibilityIdentifier(CaptureScreenID.v2Cull.rawValue)
        .sensoryFeedback(trigger: actionTick) { _, _ in
            guard actionTick > 0 else { return nil }
            return lastAction == .keep ? .impact(weight: .light) : .impact(flexibility: .rigid)
        }
        .onAppear { reloadDeck() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(current == nil ? "All sorted" : "Review · \(min(index + 1, deck.count)) of \(deck.count)")
                    .font(CaptureType.title2)
                    .foregroundStyle(CaptureColor.ink)
                Spacer()
                Button("Done") { coordinator.dismissSheet() }
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.verdigrisInk)
            }
            Text("Swipe to sort")
                .font(CaptureType.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(CaptureColor.inkSoft)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func cardView(_ specimen: Specimen, depth: Int, isTop: Bool) -> some View {
        let translation = isTop ? drag : .zero
        let angle = isTop ? Double(drag.width / 18) : 0
        let scale = 1 - CGFloat(depth) * 0.04

        return VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(specimen.title ?? "Untitled capture")
                    .font(CaptureType.title2)
                    .foregroundStyle(CaptureColor.ink)
                Spacer()
                RouteStatusChip(kind: RouteFormat.status(for: specimen))
            }
            if let maker = specimen.maker {
                Text("\(maker.uppercased()) · \(specimen.venue?.placemarkName?.uppercased() ?? RouteFormat.descriptor(for: specimen).uppercased())")
                    .font(CaptureType.monoSmall)
                    .foregroundStyle(CaptureColor.inkSoft)
            }

            RoundedRectangle(cornerRadius: 10)
                .fill(CaptureColor.paper2)
                .frame(maxWidth: .infinity, minHeight: 180)
                .overlay(
                    Image(systemName: "photo")
                        .font(CaptureType.display)
                        .foregroundStyle(CaptureColor.line2)
                )

            HStack {
                Label("cull", systemImage: "arrow.left")
                    .font(CaptureType.eyebrow)
                    .foregroundStyle(CaptureColor.error)
                Spacer()
                Text("tap to open")
                    .font(CaptureType.eyebrow)
                    .foregroundStyle(CaptureColor.inkSoft)
                Spacer()
                HStack(spacing: 4) {
                    Text("keep")
                    Image(systemName: "arrow.right")
                }
                .font(CaptureType.eyebrow)
                .foregroundStyle(CaptureColor.verdigris)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity)
        .background(CaptureColor.paper)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(swipeTint(isTop: isTop))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(CaptureColor.line, lineWidth: 1))
        .scaleEffect(scale)
        .offset(x: translation.width, y: translation.height / 8 + CGFloat(depth) * 8)
        .rotationEffect(.degrees(angle))
        .allowsHitTesting(isTop)
        .onTapGesture {
            coordinator.dismissSheet()
            coordinator.navigate(to: .specimen(specimen.id))
        }
        .gesture(dragGesture)
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: index)
    }

    private func swipeTint(isTop: Bool) -> some View {
        let accent = drag.width >= 0 ? CaptureColor.verdigris : CaptureColor.error
        let intensity = isTop ? min(abs(drag.width) / threshold, 1) * 0.22 : 0
        return RoundedRectangle(cornerRadius: 18).fill(accent.opacity(intensity))
    }

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { drag = $0.translation }
            .onEnded { value in
                if value.translation.width > threshold {
                    commit(.keep)
                } else if value.translation.width < -threshold {
                    commit(.cull)
                } else {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { drag = .zero }
                }
            }
    }

    private func commit(_ action: CullAction) {
        guard let specimen = current else { return }
        guard CaptureRouteSafetyPolicy.canCull(specimen) else {
            reloadDeck()
            return
        }
        lastAction = action
        actionTick += 1

        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            drag = CGSize(width: action == .keep ? 700 : -700, height: 0)
        }

        if action == .keep {
            // Keep means "retain in this visit", not "send to Library". The
            // explicit S3 destination choice remains outstanding.
            specimen.lifecycleRaw = CaptureLifecycle.State.session.rawValue
            specimen.touch()
            try? store.save()
        }
        // Cull: leave the deck only (Recently Deleted is a foundation seam gap —
        // no soft-delete field exists yet; we do NOT hard-delete here).

        Task { @MainActor in
            try? await Task.sleep(for: .seconds(0.18))
            index += 1
            drag = .zero
        }
    }

    private var footer: some View {
        VStack(spacing: 8) {
            if let bulkRouteError {
                Label(bulkRouteError, systemImage: "exclamationmark.triangle")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.error)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            HStack(spacing: 10) {
                RouteActionButton(
                    isSendingAll ? "Sending…" : "Hold all for later",
                    systemImage: "tray.and.arrow.down",
                    kind: .danger
                ) {
                    sendAllToInbox()
                }
                RouteActionButton("Keep all", systemImage: "checkmark", kind: .primary) {
                    keepAll()
                }
            }
            .disabled(isSendingAll)
        }
    }

    private func sendAllToInbox() {
        guard !isSendingAll else { return }
        let ids = deck
            .filter(CaptureRouteSafetyPolicy.canCull)
            .map(\.id)
        guard !ids.isEmpty else {
            coordinator.dismissSheet()
            return
        }

        isSendingAll = true
        bulkRouteError = nil
        Task { @MainActor in
            do {
                try await sync.routeAll(ids, to: .inbox)
                isSendingAll = false
                coordinator.dismissSheet()
                coordinator.popToRoot()
            } catch {
                isSendingAll = false
                bulkRouteError = "Some captures still need routing. The rest remain safely in this session."
                reloadDeck()
            }
        }
    }

    private func keepAll() {
        for specimen in deck
        where CaptureRouteSafetyPolicy.canCull(specimen) {
            specimen.lifecycleRaw = CaptureLifecycle.State.session.rawValue
            specimen.touch()
        }
        try? store.save()
        coordinator.dismissSheet()
    }

    private func reloadDeck() {
        let context = sessionContext.current(
            identity: CaptureSessionIdentity(
                userID: session.userID,
                workspaceID: session.workspaceID))
        deck = sessionSpecimens(visitID: context.visitID)
            .filter(CaptureRouteSafetyPolicy.canCull)
        index = 0
    }

    private func sessionSpecimens(visitID: UUID) -> [Specimen] {
        switch localListScope {
        case .globalFixtures:
            return store.session(visitID: visitID)
        case .owner(let owner):
            return store.session(visitID: visitID, owner: owner)
        case .unavailable:
            return []
        }
    }

    private var localListScope: CaptureLocalListScope {
        CaptureOwnerProjectionPolicy.resolve(
            runsRealServices: AppConfiguration.runsRealServices,
            userID: session.userID,
            workspaceID: session.workspaceID)
    }

    private var completionCard: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.circle")
                .font(CaptureType.display)
                .foregroundStyle(CaptureColor.verdigris)
            Text("Session sorted")
                .font(CaptureType.title2)
                .foregroundStyle(CaptureColor.ink)
            Text("Route what you kept, or keep working the room.")
                .font(CaptureType.callout)
                .foregroundStyle(CaptureColor.inkSoft)
                .multilineTextAlignment(.center)
        }
        .padding(24)
    }
}

#if DEBUG
import CaptureKitMocks

#Preview {
    let demo = RoutePreviewData.make()
    return V2CullDeckScreen(
        store: demo.store, sync: InMemoryCaptureSyncService(),
        session: MockSessionProviding(),
        coordinator: CaptureCoordinator())
}
#endif
