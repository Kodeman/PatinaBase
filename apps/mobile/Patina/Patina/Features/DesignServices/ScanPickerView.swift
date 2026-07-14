//
//  ScanPickerView.swift
//  Patina
//
//  Multi-select scan picker for the design-request flow. Sources
//  `RoomScanPackage` rows that are held-locally or already synced (the only
//  attachable states), shows names/thumbnails read from the local bundle, and
//  lets the user choose an ordered set with exactly one reassignable primary.
//  Swipe-to-delete a held scan is a cheap disk-relief valve.
//
//  The pure selection logic lives in `ScanPickerSource` so it's unit-testable
//  without SwiftUI.
//

import SwiftUI
import SwiftData
import UIKit

// MARK: - Pure source logic (unit-testable)

/// Selection/preselection resolution for the picker, kept free of SwiftUI so
/// `ScanPickerSourceTests` can exercise it directly.
public enum ScanPickerSource {

    /// The attachable packages, newest-first: held locally or synced. Mirrors
    /// `RoomScanPackage.heldOrSyncedItems`, applied to an in-memory array.
    public static func pickable(from packages: [RoomScanPackage]) -> [RoomScanPackage] {
        packages
            .filter { $0.status == .heldLocal || $0.status == .synced }
            .sorted { $0.createdAt > $1.createdAt }
    }

    /// Resolve which scan ids should be pre-selected when the flow opens.
    /// A package pre-selects if its `scanId` is in `preselectedScanIds` OR its
    /// `roomLocalId` matches `preselectedRoomId`. Order follows
    /// `preselectedScanIds` first (so the caller's intended primary leads),
    /// then any room-matched scans in newest-first order. De-duplicated.
    public static func resolvePreselection(
        packages: [RoomScanPackage],
        preselectedScanIds: [UUID],
        preselectedRoomId: UUID?
    ) -> [UUID] {
        let attachable = pickable(from: packages)
        let attachableIds = Set(attachable.map { $0.scanId })

        var ordered: [UUID] = []
        var seen = Set<UUID>()

        // 1. Explicit scan ids, in caller order (only those actually pickable).
        for id in preselectedScanIds where attachableIds.contains(id) && !seen.contains(id) {
            ordered.append(id)
            seen.insert(id)
        }

        // 2. Room-matched scans (newest-first via `attachable` order).
        if let roomId = preselectedRoomId {
            for pkg in attachable where pkg.roomLocalId == roomId && !seen.contains(pkg.scanId) {
                ordered.append(pkg.scanId)
                seen.insert(pkg.scanId)
            }
        }

        return ordered
    }
}

// MARK: - View

struct ScanPickerView: View {

    @Binding var selectedScanIds: [UUID]
    @Binding var primaryScanId: UUID?

    /// Called when the user swipes to delete a held scan (disk relief).
    let onDeleteHeld: (RoomScanPackage) -> Void

    @Query(RoomScanPackage.heldOrSyncedItems) private var packages: [RoomScanPackage]

    private var pickable: [RoomScanPackage] {
        ScanPickerSource.pickable(from: packages)
    }

    var body: some View {
        Group {
            if pickable.isEmpty {
                emptyState
            } else {
                List {
                    ForEach(pickable, id: \.scanId) { package in
                        ScanPickerRow(
                            package: package,
                            isSelected: selectedScanIds.contains(package.scanId),
                            isPrimary: primaryScanId == package.scanId,
                            onToggle: { toggle(package) },
                            onMakePrimary: { makePrimary(package) }
                        )
                        .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                        .listRowBackground(Color.clear)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                delete(package)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
    }

    // MARK: - Empty

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "internaldrive")
                .font(.system(size: 40, weight: .light))
                .foregroundStyle(PatinaColors.Text.muted)
            Text("No scans on this phone yet")
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.secondary)
            Text("You can scan a room to attach — or request design help without one below.")
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.muted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Selection

    private func toggle(_ package: RoomScanPackage) {
        let id = package.scanId
        HapticManager.shared.impact(.light)
        if let idx = selectedScanIds.firstIndex(of: id) {
            selectedScanIds.remove(at: idx)
            if primaryScanId == id {
                primaryScanId = selectedScanIds.first
            }
        } else {
            selectedScanIds.append(id)
            if primaryScanId == nil {
                primaryScanId = selectedScanIds.first
            }
        }
    }

    private func makePrimary(_ package: RoomScanPackage) {
        guard selectedScanIds.contains(package.scanId) else { return }
        HapticManager.shared.impact(.light)
        primaryScanId = package.scanId
    }

    private func delete(_ package: RoomScanPackage) {
        // Drop it from the selection first so the flow doesn't reference a
        // vanished scan.
        if let idx = selectedScanIds.firstIndex(of: package.scanId) {
            selectedScanIds.remove(at: idx)
            if primaryScanId == package.scanId {
                primaryScanId = selectedScanIds.first
            }
        }
        onDeleteHeld(package)
    }
}

// MARK: - Row

private struct ScanPickerRow: View {

    let package: RoomScanPackage
    let isSelected: Bool
    let isPrimary: Bool
    let onToggle: () -> Void
    let onMakePrimary: () -> Void

    @State private var thumbnail: UIImage?

    private var displayName: String {
        if let name = package.userProvidedRoomName, !name.isEmpty { return name }
        return "Room"
    }

    var body: some View {
        HStack(spacing: 12) {
            thumbnailView

            VStack(alignment: .leading, spacing: 4) {
                Text(displayName)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    if package.status == .synced {
                        tag("Uploaded", color: PatinaColors.Text.muted)
                    } else {
                        tag("On this phone", color: PatinaColors.Text.muted)
                    }
                    if isPrimary {
                        tag("Primary", color: PatinaColors.Text.interactive)
                    }
                }
            }

            Spacer(minLength: 8)

            if isSelected && !isPrimary {
                Button(action: onMakePrimary) {
                    Text("Make primary")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.interactive)
                }
                .buttonStyle(.plain)
            }

            Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 22))
                .foregroundStyle(isSelected ? PatinaColors.clay : PatinaColors.Text.muted.opacity(0.5))
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(isSelected ? PatinaColors.clay.opacity(0.08) : PatinaColors.Background.secondary)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(isSelected ? PatinaColors.clay.opacity(0.5) : PatinaColors.pearl, lineWidth: 1)
        )
        .contentShape(Rectangle())
        .onTapGesture(perform: onToggle)
        .task(id: package.scanId) { await loadThumbnail() }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text("\(displayName)\(isPrimary ? ", primary" : "")"))
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    @ViewBuilder
    private var thumbnailView: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10)
                .fill(PatinaColors.pearl.opacity(0.5))
            if let thumbnail {
                Image(uiImage: thumbnail)
                    .resizable()
                    .scaledToFill()
            } else {
                Image(systemName: "square.stack.3d.up")
                    .font(.system(size: 18, weight: .light))
                    .foregroundStyle(PatinaColors.Text.muted)
            }
        }
        .frame(width: 56, height: 56)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func tag(_ text: String, color: Color) -> some View {
        Text(text)
            .font(PatinaTypography.caption)
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Capsule().fill(color.opacity(0.1)))
    }

    /// Load a hero thumbnail from the local bundle, off the main actor.
    private func loadThumbnail() async {
        guard let bundleURL = package.absoluteBundleURL else { return }
        let heroId = package.heroPhotoId
        let image = await Task.detached(priority: .utility) { () -> UIImage? in
            guard let manifest = try? ScanBundleWriter.readManifest(at: bundleURL) else { return nil }
            let hero = manifest.photos.first(where: { $0.id == heroId })
                ?? manifest.photos.first(where: { $0.isUserSelectedHero })
                ?? manifest.photos.first(where: { $0.kind == .hero })
                ?? manifest.photos.first
            guard let hero else { return nil }
            let relativePath = hero.thumbnailRelativePath ?? hero.relativePath
            let fileURL = bundleURL.appendingPathComponent(relativePath)
            guard let data = try? Data(contentsOf: fileURL) else { return nil }
            return UIImage(data: data)
        }.value
        await MainActor.run { self.thumbnail = image }
    }
}
