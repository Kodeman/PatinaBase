//  DecisionDetailScreen.swift
//  Capture · Wave D (Decisions, read-only)
//
//  D2 — one decision's full read-only picture: the designer's framing (context),
//  every option as a card (image, note, price, recommended/selected state), and
//  the sent/viewed audit trail. No mutating actions — selecting/consenting is the
//  client app's write path (client_decision_options.selected is set there).

import SwiftUI
import CaptureKit

@MainActor
@Observable
final class DecisionDetailModel {
    private let service: any DecisionsReadService
    private let analytics: any CaptureAnalytics
    let decisionID: String

    private(set) var detail: FieldDecisionDetail?
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    init(decisionID: String, service: any DecisionsReadService, analytics: any CaptureAnalytics) {
        self.decisionID = decisionID
        self.service = service
        self.analytics = analytics
    }

    func start() async {
        analytics.screen(CaptureScreenID.d2DecisionDetail.rawValue)
        await load()
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            detail = try await service.decisionDetail(id: decisionID)
            errorMessage = nil
        } catch {
            errorMessage = "Couldn't load this decision — try again."
        }
    }
}

struct DecisionDetailScreen: View {
    @State private var model: DecisionDetailModel

    init(decisionID: String, decisions: any DecisionsReadService, analytics: any CaptureAnalytics) {
        _model = State(wrappedValue: DecisionDetailModel(decisionID: decisionID, service: decisions, analytics: analytics))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // A failed refresh with stale data still visible surfaces the
                // error rather than silently keeping the old detail on screen.
                if let message = model.errorMessage, model.detail != nil {
                    inlineErrorBanner(message).padding(.bottom, 16)
                }

                Group {
                    if let detail = model.detail {
                        content(detail)
                    } else if let message = model.errorMessage {
                        errorState(message)
                    } else {
                        ProgressView()
                            .tint(CaptureColor.goldenHour)
                            .padding(.top, 80)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
            .padding(20)
        }
        .background(CaptureColor.paper)
        .navigationTitle("Decision")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.start() }
        .refreshable { await model.load() }
        .accessibilityIdentifier(CaptureScreenID.d2DecisionDetail.rawValue)
    }

    // MARK: Content

    private func content(_ detail: FieldDecisionDetail) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            header(detail)

            if detail.options.isEmpty {
                Text("No options recorded on this decision yet.")
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.inkSoft)
            } else {
                ForEach(detail.options) { option in
                    optionCard(option)
                }
            }

            footerMeta(detail.decision)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func header(_ detail: FieldDecisionDetail) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("DECISION")
                .font(CaptureType.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(CaptureColor.verdigrisInk)
            Text(detail.decision.title)
                .font(CaptureType.title)
                .foregroundStyle(CaptureColor.ink)
            if let subtitle = subtitle(for: detail.decision) {
                Text(subtitle)
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
            if let context = detail.context, !context.isEmpty {
                Text(context)
                    .font(CaptureType.body)
                    .foregroundStyle(CaptureColor.ink2)
                    .padding(.top, 4)
            }
        }
    }

    private func subtitle(for decision: FieldDecision) -> String? {
        let parts = [decision.projectName, decision.clientName].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    // MARK: Option card

    private func optionCard(_ option: FieldDecisionOption) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            optionImage(option.imageURL)

            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(option.title)
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(CaptureColor.ink)
                    if let note = option.note {
                        Text(note)
                            .font(CaptureType.footnote)
                            .foregroundStyle(CaptureColor.inkSoft)
                    }
                }
                Spacer(minLength: 8)
                if option.isRecommended {
                    recommendedBadge
                }
            }

            HStack {
                if let priceLabel = option.priceLabel {
                    Text(priceLabel)
                        .font(CaptureType.monoBody)
                        .foregroundStyle(CaptureColor.ink)
                }
                Spacer()
                if option.isSelected {
                    Label("Client chose this", systemImage: "checkmark.seal.fill")
                        .font(CaptureType.footnote.weight(.semibold))
                        .foregroundStyle(CaptureColor.verdigris)
                }
            }
        }
        .padding(16)
        .background(CaptureColor.paper3, in: RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(option.isSelected ? CaptureColor.verdigris : CaptureColor.line,
                        lineWidth: option.isSelected ? 1.5 : 1)
        )
        .accessibilityElement(children: .combine)
    }

    private var recommendedBadge: some View {
        Text("RECOMMENDED")
            .font(CaptureType.eyebrow)
            .foregroundStyle(CaptureColor.verdigrisInk)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .overlay(Capsule().stroke(CaptureColor.verdigrisInk.opacity(0.5), lineWidth: 1))
    }

    @ViewBuilder
    private func optionImage(_ url: URL?) -> some View {
        if let url {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                case .empty:
                    imagePlaceholder
                case .failure:
                    imagePlaceholder
                @unknown default:
                    imagePlaceholder
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 180)
            .clipped()
            .clipShape(RoundedRectangle(cornerRadius: 10))
        } else {
            imagePlaceholder
                .frame(maxWidth: .infinity)
                .frame(height: 120)
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    private var imagePlaceholder: some View {
        ZStack {
            CaptureColor.paper2
            Image(systemName: "photo")
                .font(CaptureType.title)
                .foregroundStyle(CaptureColor.inkSoft.opacity(0.5))
        }
    }

    // MARK: Footer meta

    private func footerMeta(_ decision: FieldDecision) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Divider().background(CaptureColor.line).padding(.vertical, 4)
            if let sentAt = decision.sentAt {
                Text("Sent \(Self.dateFormatter.string(from: sentAt))")
                    .font(CaptureType.monoSmall)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
            if let viewedAt = decision.viewedAt {
                Text("Viewed \(Self.dateFormatter.string(from: viewedAt))")
                    .font(CaptureType.monoSmall)
                    .foregroundStyle(CaptureColor.success)
            } else {
                Text("Not yet viewed by client")
                    .font(CaptureType.monoSmall)
                    .foregroundStyle(CaptureColor.warning)
            }
        }
    }

    // MARK: Error

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(CaptureType.title)
                .foregroundStyle(CaptureColor.error)
            Text(message)
                .font(CaptureType.callout)
                .foregroundStyle(CaptureColor.inkSoft)
                .multilineTextAlignment(.center)
            Button("Try again") { Task { await model.load() } }
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.verdigris)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 80)
    }

    /// Shown above the (still-visible, stale) detail when a refresh fails —
    /// distinct from `errorState`, which replaces the whole screen only when
    /// there's no detail at all to fall back on.
    private func inlineErrorBanner(_ message: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle")
                .foregroundStyle(CaptureColor.error)
            Text(message)
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.error)
            Spacer()
            Button("Retry") { Task { await model.load() } }
                .font(CaptureType.footnote.weight(.semibold))
                .foregroundStyle(CaptureColor.error)
        }
        .padding(12)
        .background(CaptureColor.error.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
    }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter
    }()
}

#if DEBUG
import CaptureKitMocks

#Preview("D2 · Decision detail") {
    NavigationStack {
        DecisionDetailScreen(
            decisionID: WorkFixtures.decisionID,
            decisions: MockDecisionsReadService(),
            analytics: MockCaptureAnalytics()
        )
    }
}
#endif
