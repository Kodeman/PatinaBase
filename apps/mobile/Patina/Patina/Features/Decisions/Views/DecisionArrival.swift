//
//  DecisionArrival.swift
//  Patina
//
//  `P-30`. How a decision screen arrives from the Record row.
//
//  Two halves that have to agree on one namespace: the row publishes a
//  `matchedTransitionSource`, and the pushed screen asks for the zoom out of
//  it. The namespace itself belongs to whichever root owns BOTH — the
//  `NavigationStack` the row is inside and the destination it pushes — so it
//  travels through the environment rather than being handed down by argument
//  through six views that have no interest in it.
//
//  A screen reached from anywhere that publishes no namespace — a push
//  notification, a deep link, the Studio hub — gets the ordinary push. That is
//  not a fallback that had to be built: a zoom with no source is not a
//  transition, and the environment simply carries nil.
//

import SwiftUI

extension EnvironmentValues {
    /// The namespace the Record row's `matchedTransitionSource` lives in.
    @Entry var decisionZoomNamespace: Namespace.ID?
}

/// The pushed screen's half of the zoom.
struct DecisionArrival: ViewModifier {
    let decisionId: String
    let namespace: Namespace.ID?
    let transition: DecisionSpread.Transition

    func body(content: Content) -> some View {
        switch transition {
        case .zoom:
            if let namespace {
                content.navigationTransition(.zoom(sourceID: decisionId, in: namespace))
            } else {
                content
            }
        case .crossFade:
            // Reduce Motion. No zoom, and the push's own slide is stilled —
            // `W2R2-n1`'s rule: a presentation's animation is the system's and
            // keeps moving unless the surface stops it itself, rather than
            // waiting on a *Prefer Cross-Fade Transitions* switch that is off
            // by default.
            content.transaction { $0.disablesAnimations = true }
        }
    }
}

extension View {
    /// The Record row's half of the zoom. A row that opens something other
    /// than a decision publishes nothing — there is one source per pushed
    /// screen, and a second row claiming the same id would take the zoom.
    @ViewBuilder
    func decisionZoomSource(_ route: AppRoute?, in namespace: Namespace.ID?) -> some View {
        if let namespace, case .decisionDetail(let decisionId)? = route {
            matchedTransitionSource(id: decisionId, in: namespace)
        } else {
            self
        }
    }
}
