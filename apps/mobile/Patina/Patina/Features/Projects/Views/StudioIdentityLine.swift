//
//  StudioIdentityLine.swift
//  Patina
//
//  The studio brand line under the project header (Wave 6 / D2 of the
//  "Designer Studios: Shared Workspace + Studio Branding" program): a small
//  logo (or a monogram fallback when there's no logo) plus the studio or
//  business name, resolved via `StudioIdentityService`. Used by
//  ProjectDetailView.
//

import SwiftUI

/// Fetches independently of the rest of the header on its own `.task` —
/// renders nothing while resolving or when the resolver has no brand to show
/// (e.g. `logoUrl` null, or a solo designer with only a personal name), so it
/// never blocks or jarringly reflows the surrounding content.
struct StudioIdentityLine: View {
    let projectId: String
    @State private var identity: StudioIdentity?

    var body: some View {
        Group {
            if let identity {
                HStack(spacing: 8) {
                    avatar(for: identity)
                    Text(identity.name)
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.secondary)
                        .lineLimit(1)
                }
                .padding(.top, 2)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Studio: \(identity.name)")
            }
        }
        .task(id: projectId) {
            guard let uuid = UUID(uuidString: projectId) else { return }
            identity = await StudioIdentityService.shared.identity(forProject: uuid)
        }
    }

    /// Small logo when present; otherwise a monogram circle of the studio
    /// name's initials. `AsyncImage`'s non-`.success` phases (loading,
    /// empty URL, and failure) all fall through to the monogram so a slow
    /// or broken logo URL never leaves a blank hole in the header.
    @ViewBuilder
    private func avatar(for identity: StudioIdentity) -> some View {
        if let logoUrlString = identity.logoUrl, let url = URL(string: logoUrlString) {
            AsyncImage(url: url) { phase in
                if case .success(let image) = phase {
                    image.resizable().scaledToFill()
                } else {
                    monogram(for: identity.name)
                }
            }
            .frame(width: 20, height: 20)
            .clipShape(Circle())
        } else {
            monogram(for: identity.name)
        }
    }

    private func monogram(for name: String) -> some View {
        ZStack {
            Circle().fill(PatinaGradients.earth)
            Text(Self.initials(for: name))
                // Same fixed-size rationale as the profile monogram in
                // DailyGreetingHeader: a glyph decoration inside a fixed
                // 20pt avatar circle, not running text — scaling it with
                // Dynamic Type would overflow the circle.
                .font(PatinaTypography.monogramGlyphSmall)
                .foregroundStyle(PatinaColors.offWhite)
        }
        .frame(width: 20, height: 20)
    }

    /// Up to two initials from the studio/business name —
    /// "Chilton Design Studio" → "CD", "Maren" → "M".
    private static func initials(for name: String) -> String {
        let letters = name
            .split(separator: " ")
            .filter { !$0.isEmpty }
            .prefix(2)
            .compactMap { $0.first }
        return letters.isEmpty ? "?" : String(letters).uppercased()
    }
}

#Preview {
    VStack(alignment: .leading, spacing: 16) {
        StudioIdentityLine(projectId: "preview-with-logo")
        StudioIdentityLine(projectId: "preview-name-only")
    }
    .padding()
    .background(PatinaColors.Background.primary)
}
