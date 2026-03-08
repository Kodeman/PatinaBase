//
//  ShareScanSheet.swift
//  Patina
//
//  Sheet for sharing a room scan with a designer.
//  Allows searching for designers and configuring access level.
//

import SwiftUI

/// Sheet for sharing a room scan with a designer
struct ShareScanSheet: View {

    // MARK: - Properties

    let scanId: UUID
    let scanName: String
    let onDismiss: () -> Void

    // MARK: - State

    @State private var searchQuery = ""
    @State private var selectedDesigner: DesignerSearchResult?
    @State private var accessLevel: ScanAccessLevel = .full
    @State private var expirationOption: ExpirationOption = .never
    @State private var isSearching = false
    @State private var isSharing = false
    @State private var searchResults: [DesignerSearchResult] = []
    @State private var recentDesigners: [DesignerSearchResult] = []
    @State private var currentShares: [RoomScanAssociation] = []
    @State private var errorMessage: String?
    @State private var showSuccess = false

    @StateObject private var sharingService = ScanSharingService.shared

    // MARK: - Types

    enum ExpirationOption: String, CaseIterable {
        case never = "Never"
        case oneWeek = "1 Week"
        case oneMonth = "1 Month"
        case threeMonths = "3 Months"

        var days: Int? {
            switch self {
            case .never: return nil
            case .oneWeek: return 7
            case .oneMonth: return 30
            case .threeMonths: return 90
            }
        }
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: PatinaSpacing.xl) {
                    // Current shares section
                    if !currentShares.isEmpty {
                        currentSharesSection
                    }

                    // Search section
                    searchSection

                    // Results/Recent section
                    if selectedDesigner == nil {
                        resultsSection
                    } else {
                        selectedDesignerSection
                    }

                    Spacer(minLength: 100)
                }
                .padding(.horizontal, PatinaSpacing.xl)
                .padding(.top, PatinaSpacing.lg)
            }
            .background(PatinaColors.Background.primary)
            .navigationTitle("Share \(scanName)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        onDismiss()
                    }
                    .foregroundColor(PatinaColors.Text.secondary)
                }
            }
            .overlay(alignment: .bottom) {
                if selectedDesigner != nil {
                    shareButton
                }
            }
            .overlay {
                if showSuccess {
                    successOverlay
                }
            }
            .task {
                await loadInitialData()
            }
        }
    }

    // MARK: - Current Shares Section

    private var currentSharesSection: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.md) {
            Text("Shared With")
                .font(PatinaTypography.eyebrow)
                .foregroundColor(PatinaColors.Text.muted)

            VStack(spacing: PatinaSpacing.sm) {
                ForEach(currentShares) { share in
                    HStack(spacing: PatinaSpacing.md) {
                        // Designer avatar
                        Circle()
                            .fill(PatinaColors.clayBeige.opacity(0.3))
                            .frame(width: 40, height: 40)
                            .overlay {
                                Text(share.designer?.fullName?.prefix(1).uppercased() ?? "?")
                                    .font(PatinaTypography.bodyMedium)
                                    .foregroundColor(PatinaColors.Text.primary)
                            }

                        VStack(alignment: .leading, spacing: 2) {
                            Text(share.designer?.fullName ?? share.designer?.email ?? "Unknown")
                                .font(PatinaTypography.bodyMedium)
                                .foregroundColor(PatinaColors.Text.primary)

                            Text(share.accessLevel.capitalized)
                                .font(PatinaTypography.caption)
                                .foregroundColor(PatinaColors.Text.muted)
                        }

                        Spacer()

                        // Revoke button
                        Button {
                            Task {
                                await revokeAccess(share)
                            }
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(PatinaColors.Text.muted)
                        }
                    }
                    .padding(PatinaSpacing.md)
                    .background(PatinaColors.Background.secondary)
                    .cornerRadius(PatinaRadius.md)
                }
            }
        }
    }

    // MARK: - Search Section

    private var searchSection: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.md) {
            Text("Share With Designer")
                .font(PatinaTypography.eyebrow)
                .foregroundColor(PatinaColors.Text.muted)

            HStack(spacing: PatinaSpacing.sm) {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(PatinaColors.Text.muted)

                TextField("Search by name or email...", text: $searchQuery)
                    .font(PatinaTypography.body)
                    .foregroundColor(PatinaColors.Text.primary)
                    .autocapitalization(.none)
                    .autocorrectionDisabled()

                if !searchQuery.isEmpty {
                    Button {
                        searchQuery = ""
                        searchResults = []
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(PatinaColors.Text.muted)
                    }
                }
            }
            .padding(PatinaSpacing.md)
            .background(PatinaColors.Background.secondary)
            .cornerRadius(PatinaRadius.md)
        }
        .onChange(of: searchQuery) { _, newValue in
            Task {
                await searchDesigners(query: newValue)
            }
        }
    }

    // MARK: - Results Section

    private var resultsSection: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.md) {
            if isSearching {
                HStack {
                    Spacer()
                    ProgressView()
                        .tint(PatinaColors.clayBeige)
                    Spacer()
                }
                .padding(.vertical, PatinaSpacing.xl)
            } else if !searchQuery.isEmpty && !searchResults.isEmpty {
                Text("Search Results")
                    .font(PatinaTypography.eyebrow)
                    .foregroundColor(PatinaColors.Text.muted)

                designerList(searchResults)
            } else if !searchQuery.isEmpty && searchResults.isEmpty && searchQuery.count >= 3 {
                emptySearchState
            } else if !recentDesigners.isEmpty {
                Text("Recent")
                    .font(PatinaTypography.eyebrow)
                    .foregroundColor(PatinaColors.Text.muted)

                designerList(recentDesigners)
            } else {
                emptyState
            }
        }
    }

    private func designerList(_ designers: [DesignerSearchResult]) -> some View {
        VStack(spacing: PatinaSpacing.sm) {
            ForEach(designers) { designer in
                Button {
                    withAnimation(.spring(response: 0.3)) {
                        selectedDesigner = designer
                    }
                    HapticManager.shared.impact(.light)
                } label: {
                    HStack(spacing: PatinaSpacing.md) {
                        // Avatar
                        Circle()
                            .fill(PatinaColors.clayBeige.opacity(0.3))
                            .frame(width: 44, height: 44)
                            .overlay {
                                Text(designer.fullName?.prefix(1).uppercased() ?? designer.email.prefix(1).uppercased())
                                    .font(PatinaTypography.bodyMedium)
                                    .foregroundColor(PatinaColors.Text.primary)
                            }

                        VStack(alignment: .leading, spacing: 2) {
                            Text(designer.fullName ?? designer.email)
                                .font(PatinaTypography.bodyMedium)
                                .foregroundColor(PatinaColors.Text.primary)

                            if let businessName = designer.businessName {
                                Text(businessName)
                                    .font(PatinaTypography.caption)
                                    .foregroundColor(PatinaColors.Text.muted)
                            } else if designer.fullName != nil {
                                Text(designer.email)
                                    .font(PatinaTypography.caption)
                                    .foregroundColor(PatinaColors.Text.muted)
                            }
                        }

                        Spacer()

                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(PatinaColors.Text.muted)
                    }
                    .padding(PatinaSpacing.md)
                    .background(PatinaColors.Background.secondary)
                    .cornerRadius(PatinaRadius.md)
                }
            }
        }
    }

    private var emptySearchState: some View {
        VStack(spacing: PatinaSpacing.md) {
            Image(systemName: "person.crop.circle.badge.questionmark")
                .font(.system(size: 40))
                .foregroundColor(PatinaColors.Text.muted)

            Text("No designers found")
                .font(PatinaTypography.bodyMedium)
                .foregroundColor(PatinaColors.Text.secondary)

            Text("Try searching with a different name or email")
                .font(PatinaTypography.caption)
                .foregroundColor(PatinaColors.Text.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, PatinaSpacing.xxl)
    }

    private var emptyState: some View {
        VStack(spacing: PatinaSpacing.md) {
            Image(systemName: "person.2")
                .font(.system(size: 40))
                .foregroundColor(PatinaColors.Text.muted)

            Text("Search for a designer")
                .font(PatinaTypography.bodyMedium)
                .foregroundColor(PatinaColors.Text.secondary)

            Text("Enter their name or email to share your room scan")
                .font(PatinaTypography.caption)
                .foregroundColor(PatinaColors.Text.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, PatinaSpacing.xxl)
    }

    // MARK: - Selected Designer Section

    private var selectedDesignerSection: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.xl) {
            // Selected designer card
            if let designer = selectedDesigner {
                HStack(spacing: PatinaSpacing.md) {
                    Circle()
                        .fill(PatinaColors.clayBeige.opacity(0.3))
                        .frame(width: 50, height: 50)
                        .overlay {
                            Text(designer.fullName?.prefix(1).uppercased() ?? designer.email.prefix(1).uppercased())
                                .font(PatinaTypography.h3)
                                .foregroundColor(PatinaColors.Text.primary)
                        }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(designer.fullName ?? designer.email)
                            .font(PatinaTypography.bodyMedium)
                            .foregroundColor(PatinaColors.Text.primary)

                        if let businessName = designer.businessName {
                            Text(businessName)
                                .font(PatinaTypography.caption)
                                .foregroundColor(PatinaColors.Text.muted)
                        }
                    }

                    Spacer()

                    Button {
                        withAnimation(.spring(response: 0.3)) {
                            selectedDesigner = nil
                        }
                    } label: {
                        Text("Change")
                            .font(PatinaTypography.bodySmall)
                            .foregroundColor(PatinaColors.clayBeige)
                    }
                }
                .padding(PatinaSpacing.lg)
                .background(PatinaColors.Background.secondary)
                .cornerRadius(PatinaRadius.lg)
            }

            // Access level picker
            VStack(alignment: .leading, spacing: PatinaSpacing.md) {
                Text("Access Level")
                    .font(PatinaTypography.eyebrow)
                    .foregroundColor(PatinaColors.Text.muted)

                VStack(spacing: PatinaSpacing.sm) {
                    ForEach(ScanAccessLevel.allCases, id: \.self) { level in
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                accessLevel = level
                            }
                            HapticManager.shared.impact(.light)
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(level.displayName)
                                        .font(PatinaTypography.bodyMedium)
                                        .foregroundColor(PatinaColors.Text.primary)

                                    Text(level.description)
                                        .font(PatinaTypography.caption)
                                        .foregroundColor(PatinaColors.Text.muted)
                                        .lineLimit(2)
                                }

                                Spacer()

                                Image(systemName: accessLevel == level ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 22))
                                    .foregroundColor(accessLevel == level ? PatinaColors.clayBeige : PatinaColors.Text.muted)
                            }
                            .padding(PatinaSpacing.md)
                            .background(
                                accessLevel == level
                                    ? PatinaColors.clayBeige.opacity(0.1)
                                    : PatinaColors.Background.secondary
                            )
                            .cornerRadius(PatinaRadius.md)
                            .overlay(
                                RoundedRectangle(cornerRadius: PatinaRadius.md)
                                    .stroke(
                                        accessLevel == level ? PatinaColors.clayBeige : Color.clear,
                                        lineWidth: 1.5
                                    )
                            )
                        }
                    }
                }
            }

            // Expiration picker
            VStack(alignment: .leading, spacing: PatinaSpacing.md) {
                Text("Expires")
                    .font(PatinaTypography.eyebrow)
                    .foregroundColor(PatinaColors.Text.muted)

                HStack(spacing: PatinaSpacing.sm) {
                    ForEach(ExpirationOption.allCases, id: \.self) { option in
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                expirationOption = option
                            }
                            HapticManager.shared.impact(.light)
                        } label: {
                            Text(option.rawValue)
                                .font(PatinaTypography.bodySmall)
                                .foregroundColor(
                                    expirationOption == option
                                        ? PatinaColors.offWhite
                                        : PatinaColors.Text.secondary
                                )
                                .padding(.horizontal, PatinaSpacing.md)
                                .padding(.vertical, PatinaSpacing.sm)
                                .background(
                                    expirationOption == option
                                        ? PatinaColors.clayBeige
                                        : PatinaColors.Background.secondary
                                )
                                .cornerRadius(PatinaRadius.sm)
                        }
                    }
                }
            }

            // Error message
            if let error = errorMessage {
                Text(error)
                    .font(PatinaTypography.caption)
                    .foregroundColor(.red)
                    .padding(.top, PatinaSpacing.sm)
            }
        }
    }

    // MARK: - Share Button

    private var shareButton: some View {
        Button {
            Task {
                await shareWithDesigner()
            }
        } label: {
            HStack(spacing: PatinaSpacing.sm) {
                if isSharing {
                    ProgressView()
                        .tint(PatinaColors.offWhite)
                } else {
                    Image(systemName: "paperplane.fill")
                    Text("Share Scan")
                }
            }
            .font(PatinaTypography.bodyMedium)
            .foregroundColor(PatinaColors.offWhite)
            .frame(maxWidth: .infinity)
            .padding(.vertical, PatinaSpacing.md)
            .background(PatinaColors.clayBeige)
            .cornerRadius(PatinaRadius.lg)
        }
        .disabled(isSharing || selectedDesigner == nil)
        .padding(.horizontal, PatinaSpacing.xl)
        .padding(.bottom, PatinaSpacing.xl)
        .background(
            LinearGradient(
                colors: [
                    PatinaColors.Background.primary.opacity(0),
                    PatinaColors.Background.primary
                ],
                startPoint: .top,
                endPoint: .center
            )
        )
    }

    // MARK: - Success Overlay

    private var successOverlay: some View {
        ZStack {
            Color.black.opacity(0.5)
                .ignoresSafeArea()

            VStack(spacing: PatinaSpacing.lg) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 60))
                    .foregroundColor(.green)

                Text("Scan Shared!")
                    .font(PatinaTypography.h2)
                    .foregroundColor(.white)

                Text("Your room scan has been shared with \(selectedDesigner?.fullName ?? "the designer")")
                    .font(PatinaTypography.body)
                    .foregroundColor(.white.opacity(0.8))
                    .multilineTextAlignment(.center)
            }
            .padding(PatinaSpacing.xxl)
        }
        .transition(.opacity)
    }

    // MARK: - Actions

    private func loadInitialData() async {
        do {
            async let shares = sharingService.getAssociationsForScan(scanId: scanId)
            async let recent = sharingService.getRecentDesigners()

            currentShares = try await shares
            recentDesigners = try await recent
        } catch {
            print("Failed to load initial data: \(error)")
        }
    }

    private func searchDesigners(query: String) async {
        guard query.count >= 3 else {
            searchResults = []
            return
        }

        isSearching = true
        defer { isSearching = false }

        do {
            searchResults = try await sharingService.searchDesigners(query: query)
        } catch {
            print("Search failed: \(error)")
            searchResults = []
        }
    }

    private func shareWithDesigner() async {
        guard let designer = selectedDesigner else { return }

        isSharing = true
        errorMessage = nil
        defer { isSharing = false }

        do {
            _ = try await sharingService.shareScan(
                scanId: scanId,
                designerId: designer.id,
                accessLevel: accessLevel,
                expiresInDays: expirationOption.days
            )

            HapticManager.shared.notification(.success)

            withAnimation(.spring(response: 0.3)) {
                showSuccess = true
            }

            // Dismiss after a delay
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            onDismiss()

        } catch let error as ScanSharingError {
            HapticManager.shared.notification(.error)
            errorMessage = error.errorDescription
        } catch {
            HapticManager.shared.notification(.error)
            errorMessage = error.localizedDescription
        }
    }

    private func revokeAccess(_ share: RoomScanAssociation) async {
        do {
            try await sharingService.revokeAccess(associationId: share.id)
            HapticManager.shared.notification(.success)

            // Reload shares
            currentShares = try await sharingService.getAssociationsForScan(scanId: scanId)
        } catch {
            HapticManager.shared.notification(.error)
            print("Failed to revoke: \(error)")
        }
    }
}

// MARK: - Preview

#Preview {
    ShareScanSheet(
        scanId: UUID(),
        scanName: "Living Room",
        onDismiss: {}
    )
}
