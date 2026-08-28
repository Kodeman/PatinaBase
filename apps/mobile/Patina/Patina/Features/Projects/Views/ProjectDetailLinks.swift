//
//  ProjectDetailLinks.swift
//  Patina
//
//  The three rows at the foot of a project — proposal, invoices, documents.
//  Split out of `ProjectDetailView.swift` at W4 integration so that file stays
//  inside the 500-line ceiling; the views themselves are unchanged.
//

import SwiftUI

// MARK: - Proposal link (Wave 2 / D.1)

/// A real push to the signed proposal this project activated from. Extracted
/// as its own view so ProjectDetailView stays under the type-body ceiling.
struct ProjectProposalLink: View {
    let proposalId: String
    @Environment(\.appCoordinator) private var coordinator

    var body: some View {
        Button {
            coordinator.navigate(to: .proposalDetail(proposalId: proposalId))
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "doc.text")
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.interactive)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Proposal")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Text("View the signed proposal")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 24)
        .accessibilityIdentifier("projectDetail.proposalLink")
    }
}

// MARK: - Invoices link (Wave 2 / D.2)

/// A push to the client's invoices where this project has any. Extracted as
/// its own view so ProjectDetailView stays under the type-body ceiling.
struct ProjectInvoicesLink: View {
    @Environment(\.appCoordinator) private var coordinator

    var body: some View {
        Button {
            coordinator.navigate(to: .invoiceList)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "creditcard")
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.interactive)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Invoices")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Text("View and pay your invoices")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 24)
        .accessibilityIdentifier("projectDetail.invoicesLink")
    }
}

// MARK: - Documents link (Wave 3 / D.4)

/// A push to the client's shared documents where this project has any.
/// Extracted as its own view so ProjectDetailView stays under the type-body
/// ceiling.
struct ProjectDocumentsLink: View {
    @Environment(\.appCoordinator) private var coordinator

    var body: some View {
        Button {
            coordinator.navigate(to: .documentList)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "folder")
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.interactive)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Documents")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Text("Contracts, drawings, and shared files")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 24)
        .accessibilityIdentifier("projectDetail.documentsLink")
    }
}
