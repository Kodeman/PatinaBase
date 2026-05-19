//
//  HelpAnalytics.swift
//  Patina
//
//  PostHog analytics parity for the web `helpEvents` namespace.
//  Mirrors `apps/designer-portal/src/lib/analytics/events.ts` (spec § 10.1).
//
//  Event names and property keys are intentionally identical to the web
//  source-of-truth so PostHog dashboards aggregate cleanly across portals
//  and iOS without per-platform filters. Do not rename keys without
//  updating the web taxonomy and the cross-portal tests in
//  `apps/designer-portal/src/lib/analytics/__tests__/`.
//
//  22 events total:
//    Layer 1 (Ambient):    help.empty_state.shown / .cta_clicked
//                          help.field_helper.rendered
//    Layer 2 (Reactive):   help.tooltip.shown / .dismissed
//                          help.learnmore.expanded / .collapsed
//                          help.panel.opened / .closed
//    Layer 3 (Proactive):  help.tour.started / .step_advanced /
//                                    .completed / .abandoned
//                          help.coachmark.shown / .dismissed
//                          help.welcome_modal.shown / .action
//    Layer 4 (Reference):  help.article.opened / .scrolled_to_end /
//                                    .feedback_given
//                          help.search.performed / .result_clicked
//

import Foundation

/// Analytics service for the help & guidance system. One method per event
/// in the web `helpEvents` namespace; call sites mirror the JS API closely
/// (e.g. `HelpAnalytics.shared.tooltipShown(...)` ↔ `helpEvents.tooltip.shown(...)`).
@MainActor
public final class HelpAnalytics {

    // MARK: - Singleton

    public static let shared = HelpAnalytics()

    // MARK: - Dependencies

    private let postHog = PostHogService.shared

    // MARK: - Initialization

    private init() {}

    // MARK: - Layer 1 · Ambient

    // -- help.empty_state --

    /// Fired when an empty-state surface renders for a user.
    public func emptyStateShown(surfaceKey: String, persona: String) {
        postHog.capture(
            HelpEvent.emptyStateShown.rawValue,
            properties: [
                "surface_key": surfaceKey,
                "persona": persona,
            ]
        )
    }

    /// Fired when the primary CTA inside an empty-state surface is tapped.
    public func emptyStateCtaClicked(surfaceKey: String, ctaLabel: String) {
        postHog.capture(
            HelpEvent.emptyStateCtaClicked.rawValue,
            properties: [
                "surface_key": surfaceKey,
                "cta_label": ctaLabel,
            ]
        )
    }

    // -- help.field_helper --

    /// Fired when a field-level helper renders.
    /// Spec marks this "batch-counted, low priority" — batching may be
    /// added in a follow-up task without changing the event name.
    public func fieldHelperRendered(surfaceKey: String) {
        postHog.capture(
            HelpEvent.fieldHelperRendered.rawValue,
            properties: [
                "surface_key": surfaceKey,
            ]
        )
    }

    // MARK: - Layer 2 · Reactive

    // -- help.tooltip --

    /// Tooltip positions mirrored from the web `position` union type.
    public enum TooltipPosition: String {
        case top
        case bottom
        case left
        case right
        case auto
    }

    /// Trigger types mirrored from the web `triggerType` union type.
    public enum TooltipTrigger: String {
        case hover
        case focus
        case click
    }

    /// Fired when a tooltip becomes visible.
    public func tooltipShown(
        surfaceKey: String,
        position: TooltipPosition,
        triggerType: TooltipTrigger
    ) {
        postHog.capture(
            HelpEvent.tooltipShown.rawValue,
            properties: [
                "surface_key": surfaceKey,
                "position": position.rawValue,
                "trigger_type": triggerType.rawValue,
            ]
        )
    }

    /// Fired when a tooltip is dismissed (with the visible-for duration).
    public func tooltipDismissed(surfaceKey: String, durationMs: Int) {
        postHog.capture(
            HelpEvent.tooltipDismissed.rawValue,
            properties: [
                "surface_key": surfaceKey,
                "duration_ms": durationMs,
            ]
        )
    }

    // -- help.learnmore --

    /// Fired when a "learn more" disclosure expands.
    public func learnmoreExpanded(surfaceKey: String) {
        postHog.capture(
            HelpEvent.learnmoreExpanded.rawValue,
            properties: [
                "surface_key": surfaceKey,
            ]
        )
    }

    /// Fired when a "learn more" disclosure collapses (with viewed-for duration).
    public func learnmoreCollapsed(surfaceKey: String, viewedMs: Int) {
        postHog.capture(
            HelpEvent.learnmoreCollapsed.rawValue,
            properties: [
                "surface_key": surfaceKey,
                "viewed_ms": viewedMs,
            ]
        )
    }

    // -- help.panel --

    /// Trigger sources for the help panel mirrored from the web union type.
    public enum PanelTrigger: String {
        case utilityBar = "utility_bar"
        case keyboardShortcut = "keyboard_shortcut"
    }

    /// Fired when the help panel opens.
    public func panelOpened(fromSurfaceKey: String, triggerType: PanelTrigger) {
        postHog.capture(
            HelpEvent.panelOpened.rawValue,
            properties: [
                "from_surface_key": fromSurfaceKey,
                "trigger_type": triggerType.rawValue,
            ]
        )
    }

    /// Fired when the help panel closes.
    public func panelClosed(
        fromSurfaceKey: String,
        durationMs: Int,
        articleOpened: Bool
    ) {
        postHog.capture(
            HelpEvent.panelClosed.rawValue,
            properties: [
                "from_surface_key": fromSurfaceKey,
                "duration_ms": durationMs,
                "article_opened": articleOpened,
            ]
        )
    }

    // MARK: - Layer 3 · Proactive

    // -- help.tour --

    /// Fired when a guided tour starts.
    public func tourStarted(tourKey: String, triggerSource: String) {
        postHog.capture(
            HelpEvent.tourStarted.rawValue,
            properties: [
                "tour_key": tourKey,
                "trigger_source": triggerSource,
            ]
        )
    }

    /// Fired when the user advances to the next tour step.
    public func tourStepAdvanced(
        tourKey: String,
        stepNumber: Int,
        stepSurfaceKey: String
    ) {
        postHog.capture(
            HelpEvent.tourStepAdvanced.rawValue,
            properties: [
                "tour_key": tourKey,
                "step_number": stepNumber,
                "step_surface_key": stepSurfaceKey,
            ]
        )
    }

    /// Fired when the user completes the full tour.
    public func tourCompleted(
        tourKey: String,
        durationMs: Int,
        stepsViewed: Int
    ) {
        postHog.capture(
            HelpEvent.tourCompleted.rawValue,
            properties: [
                "tour_key": tourKey,
                "duration_ms": durationMs,
                "steps_viewed": stepsViewed,
            ]
        )
    }

    /// Fired when the user abandons a tour before completion.
    public func tourAbandoned(
        tourKey: String,
        atStep: Int,
        totalSteps: Int
    ) {
        postHog.capture(
            HelpEvent.tourAbandoned.rawValue,
            properties: [
                "tour_key": tourKey,
                "at_step": atStep,
                "total_steps": totalSteps,
            ]
        )
    }

    // -- help.coachmark --

    /// Fired when a coachmark renders.
    public func coachmarkShown(surfaceKey: String) {
        postHog.capture(
            HelpEvent.coachmarkShown.rawValue,
            properties: [
                "surface_key": surfaceKey,
            ]
        )
    }

    /// Fired when a coachmark is dismissed (with viewed-for duration).
    public func coachmarkDismissed(surfaceKey: String, viewedMs: Int) {
        postHog.capture(
            HelpEvent.coachmarkDismissed.rawValue,
            properties: [
                "surface_key": surfaceKey,
                "viewed_ms": viewedMs,
            ]
        )
    }

    // -- help.welcome_modal --

    /// Actions a user can take from the welcome modal.
    public enum WelcomeModalAction: String {
        case takeTour = "take_tour"
        case jumpIn = "jump_in"
    }

    /// Fired when the welcome modal renders.
    public func welcomeModalShown(firstSignin: Bool) {
        postHog.capture(
            HelpEvent.welcomeModalShown.rawValue,
            properties: [
                "first_signin": firstSignin,
            ]
        )
    }

    /// Fired when the user takes an action from the welcome modal.
    public func welcomeModalAction(action: WelcomeModalAction) {
        postHog.capture(
            HelpEvent.welcomeModalAction.rawValue,
            properties: [
                "action": action.rawValue,
            ]
        )
    }

    // MARK: - Layer 4 · Reference

    // -- help.article --

    /// Fired when a help article opens.
    public func articleOpened(
        articleKey: String,
        fromSurfaceKey: String,
        fromSearch: Bool
    ) {
        postHog.capture(
            HelpEvent.articleOpened.rawValue,
            properties: [
                "article_key": articleKey,
                "from_surface_key": fromSurfaceKey,
                "from_search": fromSearch,
            ]
        )
    }

    /// Fired when the user scrolls an article to the end (engagement signal).
    public func articleScrolledToEnd(articleKey: String, durationMs: Int) {
        postHog.capture(
            HelpEvent.articleScrolledToEnd.rawValue,
            properties: [
                "article_key": articleKey,
                "duration_ms": durationMs,
            ]
        )
    }

    /// Sentiment options for article feedback, mirrored from the web union.
    public enum ArticleFeedbackSentiment: String {
        case positive
        case negative
    }

    /// Fired when the user submits feedback on an article.
    public func articleFeedbackGiven(
        articleKey: String,
        sentiment: ArticleFeedbackSentiment,
        hasComment: Bool
    ) {
        postHog.capture(
            HelpEvent.articleFeedbackGiven.rawValue,
            properties: [
                "article_key": articleKey,
                "sentiment": sentiment.rawValue,
                "has_comment": hasComment,
            ]
        )
    }

    // -- help.search --

    /// Fired when the user runs a help search query.
    public func searchPerformed(
        query: String,
        resultCount: Int,
        fromSurfaceKey: String
    ) {
        postHog.capture(
            HelpEvent.searchPerformed.rawValue,
            properties: [
                "query": query,
                "result_count": resultCount,
                "from_surface_key": fromSurfaceKey,
            ]
        )
    }

    /// Fired when the user taps a result in the help search list.
    public func searchResultClicked(
        query: String,
        articleKey: String,
        position: Int
    ) {
        postHog.capture(
            HelpEvent.searchResultClicked.rawValue,
            properties: [
                "query": query,
                "article_key": articleKey,
                "position": position,
            ]
        )
    }
}

// MARK: - Event Name Catalog

/// Canonical event-name strings for the help system, mirroring the web
/// `helpEvents` namespace 1:1. Strings are case-sensitive and MUST NOT
/// drift from `apps/designer-portal/src/lib/analytics/events.ts`.
public enum HelpEvent: String, CaseIterable {
    // Layer 1 · Ambient
    case emptyStateShown        = "help.empty_state.shown"
    case emptyStateCtaClicked   = "help.empty_state.cta_clicked"
    case fieldHelperRendered    = "help.field_helper.rendered"

    // Layer 2 · Reactive
    case tooltipShown           = "help.tooltip.shown"
    case tooltipDismissed       = "help.tooltip.dismissed"
    case learnmoreExpanded      = "help.learnmore.expanded"
    case learnmoreCollapsed     = "help.learnmore.collapsed"
    case panelOpened            = "help.panel.opened"
    case panelClosed            = "help.panel.closed"

    // Layer 3 · Proactive
    case tourStarted            = "help.tour.started"
    case tourStepAdvanced       = "help.tour.step_advanced"
    case tourCompleted          = "help.tour.completed"
    case tourAbandoned          = "help.tour.abandoned"
    case coachmarkShown         = "help.coachmark.shown"
    case coachmarkDismissed     = "help.coachmark.dismissed"
    case welcomeModalShown      = "help.welcome_modal.shown"
    case welcomeModalAction     = "help.welcome_modal.action"

    // Layer 4 · Reference
    case articleOpened          = "help.article.opened"
    case articleScrolledToEnd   = "help.article.scrolled_to_end"
    case articleFeedbackGiven   = "help.article.feedback_given"
    case searchPerformed        = "help.search.performed"
    case searchResultClicked    = "help.search.result_clicked"
}
