//  LibrarySearchScreen.swift
//  Capture · Team F (System Surface)
//
//  U2 · Library search (route `.librarySearch`, id `u2LibrarySearch`).
//  Search the existing library from the field so a designer can check a piece
//  isn't already captured before re-shooting it. Scope chips: All · This project
//  · Saved here (this venue). A close match raises the "already in your library"
//  dedupe warning. Tap a result → V3 detail.
//  Source: container.store.search(SpecimenQuery(text:)); venue from location.

import SwiftUI
import Foundation
import CaptureKit

struct LibrarySearchScreen: View {
    let store: CaptureStore
    let location: any LocationService
    let analytics: any CaptureAnalytics
    let coordinator: CaptureCoordinator

    enum Scope: CaseIterable, Identifiable {
        case all, project, here
        var id: Self { self }
        var label: String {
            switch self {
            case .all: return "All"
            case .project: return "This project"
            case .here: return "Saved here"
            }
        }
    }

    @State private var queryText = ""
    @State private var scope: Scope = .all
    @State private var results: [Specimen] = []
    @State private var venue: VenueStamp?
    @State private var activeProjectName: String?
    @FocusState private var searchFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            searchField
            scopeChips
            if let dup = duplicate {
                dedupeBanner(dup)
            }
            content
        }
        .background(CaptureColor.paper)
        .navigationTitle("Library")
        .navigationBarTitleDisplayMode(.large)
        .task {
            analytics.screen(CaptureScreenID.u2LibrarySearch.rawValue)
            venue = await location.currentVenue()
            deriveActiveProject()
            runSearch()
        }
        .accessibilityIdentifier(CaptureScreenID.u2LibrarySearch.rawValue)
    }

    // MARK: search field

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(CaptureColor.inkSoft)
            TextField("search “oak sofa…”", text: $queryText)
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.ink)
                .focused($searchFocused)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .onChange(of: queryText) { _, _ in runSearch() }
            if !queryText.isEmpty {
                Button {
                    queryText = ""
                    runSearch()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(CaptureColor.line2)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .background(RoundedRectangle(cornerRadius: 12).fill(CaptureColor.paper3))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(CaptureColor.line, lineWidth: 1))
        .padding(.horizontal, 20)
        .padding(.bottom, 10)
    }

    // MARK: scope chips

    private var scopeChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Scope.allCases) { s in
                    let selected = s == scope
                    Button {
                        scope = s
                        analytics.event("library.scope", ["scope": String(describing: s)])
                        runSearch()
                    } label: {
                        Text(s.label)
                            .font(CaptureType.monoSmall)
                            .textCase(.uppercase)
                            .foregroundStyle(selected ? CaptureColor.paper3 : CaptureColor.ink2)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(
                                Capsule().fill(selected ? CaptureColor.ink : CaptureColor.paper2)
                            )
                    }
                    .buttonStyle(.plain)
                    .disabled(s == .project && activeProjectName == nil)
                    .opacity(s == .project && activeProjectName == nil ? 0.4 : 1)
                }
            }
            .padding(.horizontal, 20)
        }
        .padding(.bottom, 12)
    }

    // MARK: dedupe banner

    private func dedupeBanner(_ match: Specimen) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "diamond.fill")
                .font(.caption2)
                .foregroundStyle(CaptureColor.brass)
            VStack(alignment: .leading, spacing: 1) {
                Text("Already in your library")
                    .font(CaptureType.footnote.weight(.semibold))
                    .foregroundStyle(CaptureColor.ink)
                Text("“\(match.title ?? match.maker ?? "this piece")” — avoids a duplicate")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 10).fill(CaptureColor.brass2.opacity(0.18)))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(CaptureColor.brass.opacity(0.4), lineWidth: 1))
        .padding(.horizontal, 20)
        .padding(.bottom, 10)
    }

    // MARK: results

    @ViewBuilder private var content: some View {
        if results.isEmpty {
            VStack(spacing: 8) {
                Image(systemName: queryText.isEmpty ? "books.vertical" : "magnifyingglass")
                    .font(.largeTitle)
                    .foregroundStyle(CaptureColor.line2)
                Text(queryText.isEmpty ? "Search your library" : "No matches — capture it fresh")
                    .font(CaptureType.body)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(results, id: \.id) { specimen in
                        Button {
                            analytics.event("library.open_result")
                            coordinator.navigate(to: .specimen(specimen.id))
                        } label: {
                            resultRow(specimen)
                        }
                        .buttonStyle(.plain)
                        Rectangle().fill(CaptureColor.line).frame(height: 1)
                    }
                }
            }
        }
    }

    private func resultRow(_ s: Specimen) -> some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 8)
                .fill(CaptureColor.paper2)
                .frame(width: 44, height: 44)
                .overlay(
                    Image(systemName: s.photos.isEmpty ? "square.dashed" : "photo")
                        .foregroundStyle(CaptureColor.line2)
                )
            VStack(alignment: .leading, spacing: 3) {
                Text(s.title ?? s.maker ?? "Untitled capture")
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.ink)
                Text(subtitle(s))
                    .font(CaptureType.monoSmall)
                    .textCase(.uppercase)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
            Spacer(minLength: 8)
            destinationBadge(s)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    private func subtitle(_ s: Specimen) -> String {
        let place = s.maker ?? s.venue?.placemarkName ?? s.venue?.projectName ?? "—"
        let tag: String
        switch s.destination {
        case .library: tag = s.status == .committed ? "verified" : "library"
        case .inbox: tag = "inbox"
        case .undecided: tag = "draft"
        }
        return "\(place) · \(tag)"
    }

    @ViewBuilder private func destinationBadge(_ s: Specimen) -> some View {
        let (text, color): (String, Color) = {
            switch s.destination {
            case .library: return ("library", CaptureColor.verdigris)
            case .inbox: return ("inbox", CaptureColor.brass)
            case .undecided: return ("draft", CaptureColor.inkSoft)
            }
        }()
        Text(text)
            .font(CaptureType.eyebrow)
            .textCase(.uppercase)
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .overlay(Capsule().stroke(color.opacity(0.5), lineWidth: 1))
    }

    // MARK: search + scope logic

    /// A library match whose title/maker contains the full query → dedupe warning.
    private var duplicate: Specimen? {
        let q = queryText.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else { return nil }
        return results.first {
            $0.destination == .library &&
            (($0.title?.localizedCaseInsensitiveContains(q) ?? false) ||
             ($0.maker?.localizedCaseInsensitiveContains(q) ?? false) ||
             ($0.sku?.localizedCaseInsensitiveContains(q) ?? false))
        }
    }

    private func runSearch() {
        let base = store.search(SpecimenQuery(text: queryText.isEmpty ? nil : queryText))
        switch scope {
        case .all:
            results = base
        case .project:
            results = base.filter { activeProjectName != nil && $0.venue?.projectName == activeProjectName }
        case .here:
            results = base.filter { matchesVenue($0.venue) }
        }
    }

    /// Same showroom/venue as the current capture session (placemark or room).
    private func matchesVenue(_ stamp: VenueStamp?) -> Bool {
        guard let stamp, let venue else { return false }
        if let a = stamp.placemarkName, let b = venue.placemarkName,
           a.caseInsensitiveCompare(b) == .orderedSame { return true }
        if let a = stamp.projectRoomId, let b = venue.projectRoomId, a == b { return true }
        return false
    }

    /// No active-project seam exists; derive it from the most recent capture's
    /// venue so "This project" can scope honestly. (Seam gap — see manifest.)
    private func deriveActiveProject() {
        activeProjectName = venue?.projectName
            ?? store.search(SpecimenQuery()).compactMap { $0.venue?.projectName }.first
    }
}

#if DEBUG
import CaptureKitMocks

#Preview {
    let store = try! CaptureStore.inMemory()
    @MainActor func make(_ title: String, maker: String?, dest: CaptureDestination, status: CaptureStatus, venue: VenueStamp?) {
        let s = store.newDraft()
        s.title = title
        s.maker = maker
        s.destination = dest
        s.status = status
        s.venue = venue
        let p = CapturePhoto(filename: "\(title).heic", width: 1170, height: 1560, isPrimary: true)
        p.specimen = s
        s.photos.append(p)
    }
    let hp = VenueStamp(projectName: "Walbridge Res.", placemarkName: "High Point · Showroom 214")
    make("Lindqvist 3-Seat", maker: "Holloway", dest: .library, status: .committed, venue: hp)
    make("Oak console", maker: nil, dest: .library, status: .committed, venue: hp)
    make("Marlow chair", maker: nil, dest: .inbox, status: .ready,
         venue: VenueStamp(projectName: "Market Pull", placemarkName: "Market · Hall 3"))

    return NavigationStack {
        LibrarySearchScreen(
            store: store,
            location: MockLocationService(),
            analytics: MockCaptureAnalytics(),
            coordinator: CaptureCoordinator()
        )
    }
}
#endif
