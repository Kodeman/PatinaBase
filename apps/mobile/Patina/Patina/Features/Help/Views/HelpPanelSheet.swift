//
//  HelpPanelSheet.swift
//  Patina
//
//  SwiftUI presentation of the Help & Guidance "contextual help panel" on
//  iOS — the native equivalent of the web `<ContextualHelpPanel />` shipped
//  by Sprint 2 Stream G6.
//
//  Why a sheet, not a slide-out
//  ----------------------------
//  The web component uses a right-edge slide-out drawer. On iOS that pattern
//  conflicts with the HIG: sheets are the canonical way to surface secondary,
//  dismissible content. We use the standard `.sheet` modifier with
//  `.presentationDetents([.medium, .large])` so the user can preview articles
//  at half-height and pull up to read more. This matches every other
//  contextual help surface on the system (Mail, Photos, Health).
//
//  Data sourcing
//  -------------
//  Articles are fetched via `SanityHelpClient.shared.fetchArticles(...)`,
//  added by this task. The GROQ query mirrors the web ARTICLES_QUERY:
//
//    *[_type == "helpContent" && contentType == "helpArticle"
//      && (surfaceKey == $sk || string::startsWith($sk, surfaceKey + "/"))]
//    | order(length(surfaceKey) desc) [0...20] { ... }
//
//  The match-by-prefix step lets an article authored against a parent surface
//  (`designer-portal/pipeline`) surface on every nested screen
//  (`designer-portal/pipeline/project-list`, etc.).
//
//  Analytics
//  ---------
//  Fires `HelpAnalytics.shared.panelOpened(...)` in `.task` (when the sheet
//  body first renders) and `panelClosed(...)` in `.onDisappear` with the
//  measured `durationMs`. Both events use the canonical `help.panel.*` event
//  names mirrored from the web `helpEvents` namespace.
//
//  Sprint 2 deferrals (documented per spec §4.6 and task contract)
//  ---------------------------------------------------------------
//  - Full portable-text article body: this panel renders the
//    `oneSentenceAnswer` summary plus a "Coming soon: full article view"
//    notice. The full <HelpArticle /> renderer with portable-text →
//    SwiftUI mapping ships in Sprint 3 Stream E.
//  - In-panel search: Sprint 3 (the search experience needs the article-body
//    index, which is gated on the body renderer).
//  - Related-articles section: Sprint 3 (depends on resolving Sanity
//    `relatedArticles` references, also Stream E).
//  - Article feedback widget: Sprint 3.
//
//  Accessibility
//  -------------
//  Uses SF Symbols + system fonts so Dynamic Type, VoiceOver, and Bold Text
//  all behave correctly. Article rows are buttons with implicit labels; the
//  close button has an explicit `accessibilityLabel`. `ContentUnavailableView`
//  ships an accessibility-friendly empty state out of the box.
//

import Foundation
import SwiftUI

// MARK: - HelpPanelSheet

/// Sheet-presented help panel for a given surface. Use the
/// `.helpPanel(isPresented:surfaceKey:)` modifier (below) on the screen you
/// want to attach help to — this view exists for direct instantiation
/// (previews, tests, custom hosting).
public struct HelpPanelSheet: View {

    // MARK: Inputs

    /// The surface key whose related articles should populate the panel.
    public let surfaceKey: SurfaceKey

    /// Two-way binding so the close button + swipe-down can dismiss the sheet.
    @Binding public var isPresented: Bool

    /// Optional dependency injection point for tests. The shared `SanityHelpClient`
    /// is used in production.
    public let client: SanityHelpClient

    // MARK: State

    @State private var articles: [HelpArticleSummary] = []
    @State private var isLoading: Bool = true
    @State private var loadError: Bool = false
    @State private var openedAt: Date?
    @State private var articleOpened: Bool = false

    // MARK: Init

    public init(
        surfaceKey: SurfaceKey,
        isPresented: Binding<Bool>,
        client: SanityHelpClient = .shared
    ) {
        self.surfaceKey = surfaceKey
        self._isPresented = isPresented
        self.client = client
    }

    // MARK: Body

    public var body: some View {
        NavigationStack {
            content
                .navigationTitle("Help")
                .toolbarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            isPresented = false
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .symbolRenderingMode(.hierarchical)
                        }
                        .accessibilityLabel("Close help panel")
                        .accessibilityIdentifier("HelpPanelSheet.CloseButton")
                    }
                }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .task {
            openedAt = Date()
            HelpAnalytics.shared.panelOpened(
                fromSurfaceKey: surfaceKey,
                triggerType: .utilityBar
            )
            await loadArticles()
        }
        .onDisappear {
            guard let start = openedAt else { return }
            let durationMs = Int(Date().timeIntervalSince(start) * 1000)
            HelpAnalytics.shared.panelClosed(
                fromSurfaceKey: surfaceKey,
                durationMs: durationMs,
                articleOpened: articleOpened
            )
            openedAt = nil
        }
    }

    // MARK: Subviews

    @ViewBuilder
    private var content: some View {
        if isLoading {
            PatinaLoadingState()
                .accessibilityIdentifier("HelpPanelSheet.Loading")
        } else if loadError {
            // U29: a fetch failure used to fall through to the same
            // "No help articles yet" copy as a genuinely empty surface,
            // silently swallowing the error. Surface it with a retry.
            PatinaErrorState(
                message: "Couldn't load help for this screen.",
                action: { Task { await loadArticles() } }
            )
            .accessibilityIdentifier("HelpPanelSheet.ErrorState")
        } else if articles.isEmpty {
            ContentUnavailableView(
                "No help articles yet",
                systemImage: "questionmark.circle",
                description: Text("Help content for this screen is on the way. Pull down to dismiss.")
            )
            .accessibilityIdentifier("HelpPanelSheet.EmptyState")
        } else {
            articleList
        }
    }

    // Wave 1 E.1: rows no longer link anywhere. `HelpArticleSummary` has no
    // body to show — the projection carries only title + one-sentence answer
    // — so the old NavigationLink landed on a "Full article view is coming
    // soon" stub. Until the Sprint 3 portable-text renderer ships, the row
    // IS the article: title + full answer inline, no dead-end affordance.
    private var articleList: some View {
        List(articles) { article in
            articleRow(for: article)
                .accessibilityIdentifier("HelpPanelSheet.ArticleRow.\(article.id)")
        }
        .listStyle(.plain)
        .accessibilityIdentifier("HelpPanelSheet.ArticleList")
    }

    private func articleRow(for article: HelpArticleSummary) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(article.title)
                .font(.headline)
                .foregroundStyle(.primary)
            if !article.summary.isEmpty {
                // The one-sentence answer is the whole payload — render it
                // in full rather than teasing a fuller view that doesn't
                // exist yet.
                Text(article.summary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    // MARK: Loaders

    private func loadArticles() async {
        await MainActor.run { self.isLoading = true }
        do {
            let results = try await client.fetchArticles(forSurfaceKey: surfaceKey)
            await MainActor.run {
                self.articles = results
                self.loadError = false
                self.isLoading = false
            }
        } catch {
            // U29: `SanityHelpClient.fetchArticles` throws
            // `HelpArticleListFetchError` for a genuine transport/HTTP/decode
            // failure — distinct from a successful fetch that legitimately
            // found zero articles (`articles.isEmpty` below, not this catch).
            // That's the real case this error state and retry exist for. A
            // malformed `surfaceKey` (`InvalidSurfaceKeyError`) also lands
            // here — a static per-screen configuration bug — logged so it's
            // caught in QA rather than silently rendering as "no articles."
            PatinaLog.ui.error("[HelpPanelSheet] loadArticles failed: \(error)")
            await MainActor.run {
                self.articles = []
                self.loadError = true
                self.isLoading = false
            }
        }
    }
}

// MARK: - HelpArticleStubView

/// Sprint 2 placeholder body for an article row. Renders the article title,
/// the one-sentence answer (which is what the GROQ projection puts into
/// `summary`), and a "Coming soon" notice pointing at the Sprint 3 work.
///
/// Internal because it's a stub — Sprint 3 will introduce a public
/// `HelpArticleView` that pulls the full document, renders portable-text,
/// shows feedback controls, and resolves `relatedArticles` references.
public struct HelpArticleStubView: View {

    public let article: HelpArticleSummary

    public init(article: HelpArticleSummary) {
        self.article = article
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(article.title)
                    .font(.title2)
                    .fontWeight(.semibold)
                    .accessibilityAddTraits(.isHeader)

                if !article.summary.isEmpty {
                    Text(article.summary)
                        .font(.body)
                        .foregroundStyle(.primary)
                }

                Divider()

                Label {
                    Text("Full article view is coming soon.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } icon: {
                    Image(systemName: "hammer")
                        .foregroundStyle(.secondary)
                }
                .accessibilityIdentifier("HelpPanelSheet.ComingSoonNotice")

                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
        }
        .navigationTitle(article.title)
        .toolbarTitleDisplayMode(.inline)
    }
}

// MARK: - Convenience modifier

public extension View {
    /// Attach the help panel sheet to any screen. The panel uses
    /// `[.medium, .large]` presentation detents per iOS HIG.
    ///
    /// Usage:
    /// ```swift
    /// SomeScreen()
    ///   .helpPanel(
    ///     isPresented: $showHelp,
    ///     surfaceKey: SurfaceKeys.DesignerPortal.Today.dashboard
    ///   )
    /// ```
    func helpPanel(
        isPresented: Binding<Bool>,
        surfaceKey: SurfaceKey
    ) -> some View {
        sheet(isPresented: isPresented) {
            HelpPanelSheet(surfaceKey: surfaceKey, isPresented: isPresented)
        }
    }
}

// MARK: - Previews

#if DEBUG
#Preview("Empty state") {
    Color.clear
        .sheet(isPresented: .constant(true)) {
            HelpPanelSheet(
                surfaceKey: SurfaceKeys.DesignerPortal.Today.dashboard,
                isPresented: .constant(true)
            )
        }
}

#Preview("Stub article") {
    NavigationStack {
        HelpArticleStubView(
            article: HelpArticleSummary(
                id: "abc123",
                surfaceKey: "designer-portal/pipeline",
                title: "What does the pipeline view show?",
                summary: "A snapshot of every project grouped by deal stage, sorted by recent activity."
            )
        )
    }
}
#endif
