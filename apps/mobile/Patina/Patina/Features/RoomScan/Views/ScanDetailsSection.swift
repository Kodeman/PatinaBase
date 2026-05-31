//
//  ScanDetailsSection.swift
//  Patina
//
//  "Scan Details" table for the post-scan Review screen (PT-6-3). Renders a
//  read-only summary of the captured bundle (photo count, dimensions, openings,
//  detected objects, capture method, total size). Behavior-preserving
//  extraction from ScanReviewView.scanDetailsSection / scanDetailRows.
//

import SwiftUI

/// Read-only "Scan Details" summary table.
struct ScanDetailsSection: View {

    let manifest: ScanManifest
    let session: RoomScanSession?

    private struct DetailRow {
        let label: String
        let value: String
    }

    var body: some View {
        let rows = scanDetailRows()
        return VStack(alignment: .leading, spacing: 12) {
            scanReviewSectionLabel("Scan Details")
            VStack(spacing: 0) {
                ForEach(rows.indices, id: \.self) { idx in
                    let row = rows[idx]
                    HStack {
                        Text(row.label)
                            .font(.custom("Inter-Regular", size: 13, relativeTo: .footnote))
                            .foregroundStyle(PatinaColors.agedOak)
                        Spacer()
                        Text(row.value)
                            .font(.custom("DMMono-Regular", size: 12, relativeTo: .caption))
                            .foregroundStyle(PatinaColors.charcoal)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    if idx < rows.count - 1 {
                        Rectangle()
                            .fill(PatinaColors.pearl.opacity(0.6))
                            .frame(height: 1)
                            .padding(.horizontal, 14)
                    }
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(PatinaColors.softCream)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(PatinaColors.pearl, lineWidth: 1)
            )
        }
    }

    private func scanDetailRows() -> [DetailRow] {
        var rows: [DetailRow] = []

        rows.append(DetailRow(label: "Photos", value: "\(manifest.photos.count)"))

        if let session {
            let dims = session.dimensions
            let length = dims.length
            let width = dims.width
            if length > 0 && width > 0 {
                if let height = dims.height, height > 0 {
                    rows.append(DetailRow(
                        label: "Dimensions",
                        value: String(format: "%.1f × %.1f × %.1f m", length, width, height)
                    ))
                } else {
                    rows.append(DetailRow(
                        label: "Dimensions",
                        value: String(format: "%.1f × %.1f m", length, width)
                    ))
                }
            }
            if dims.area > 0 {
                rows.append(DetailRow(
                    label: "Floor area",
                    value: String(format: "%.1f m²", dims.area)
                ))
            }

            let windows = session.features.windowCount
            let doors = session.features.doorCount
            if windows > 0 || doors > 0 {
                rows.append(DetailRow(
                    label: "Openings",
                    value: "\(windows) window\(windows == 1 ? "" : "s"), \(doors) door\(doors == 1 ? "" : "s")"
                ))
            }

            if !session.detectedObjects.isEmpty {
                rows.append(DetailRow(
                    label: "Objects detected",
                    value: "\(session.detectedObjects.count)"
                ))
            }

            rows.append(DetailRow(
                label: "Method",
                value: session.scanMethod == .lidar ? "LiDAR" : "Manual"
            ))
        }

        let totalBytes = manifest.artifacts.reduce(0) { $0 + $1.sizeBytes }
            + manifest.photos.reduce(0) { $0 + $1.sizeBytes }
        if totalBytes > 0 {
            rows.append(DetailRow(label: "Captured", value: formattedSize(bytes: totalBytes)))
        }

        return rows
    }

    private func formattedSize(bytes: Int) -> String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        formatter.allowedUnits = [.useMB, .useKB, .useGB]
        return formatter.string(fromByteCount: Int64(bytes))
    }
}
