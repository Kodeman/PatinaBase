//
//  ProjectListView.swift
//  Patina
//
//  Read-only list of projects the user can see (RLS-bounded).
//

import SwiftUI

struct ProjectListView: View {
    @Environment(\.appCoordinator) private var coordinator
    @State private var viewModel = ProjectsListViewModel()

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                header
                content
            }
            .padding(.bottom, 120)
        }
        .background(PatinaColors.offWhite)
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            MonoLabel(text: "PROJECTS")
                .tracking(2)
            Text(viewModel.projects.isEmpty ? "No projects yet" : "\(viewModel.projects.count) project\(viewModel.projects.count == 1 ? "" : "s")")
                .font(PatinaTypography.h3)
                .foregroundColor(PatinaColors.charcoal)
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.projects.isEmpty {
            ProgressView()
                .tint(PatinaColors.clay)
                .padding(.top, 60)
                .frame(maxWidth: .infinity)
        } else if let error = viewModel.error, viewModel.projects.isEmpty {
            errorView(error)
        } else if viewModel.projects.isEmpty {
            emptyView
        } else {
            VStack(spacing: 12) {
                ForEach(viewModel.projects) { project in
                    Button {
                        coordinator.navigate(to: .projectDetail(projectId: project.id))
                    } label: {
                        projectCard(project)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
        }
    }

    private func projectCard(_ project: RemoteProject) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(project.name)
                    .font(PatinaTypography.h5)
                    .foregroundColor(PatinaColors.charcoal)
                Spacer()
                if let status = project.status {
                    Text(status.capitalized)
                        .font(PatinaTypography.monoTiny)
                        .foregroundColor(PatinaColors.clay)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(PatinaColors.clay.opacity(0.1))
                        .clipShape(Capsule())
                }
            }
            HStack(spacing: 16) {
                if let phase = project.current_phase {
                    label("Phase", phase)
                }
                if let total = project.total_amount_cents ?? project.budget_cents {
                    label("Total", formatPrice(total))
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.softCream)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func label(_ caption: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            MonoLabel(text: caption)
            Text(value)
                .font(PatinaTypography.bodySmallMedium)
                .foregroundColor(PatinaColors.mocha)
        }
    }

    private var emptyView: some View {
        VStack(spacing: 8) {
            Image(systemName: "rectangle.stack")
                .font(.system(size: 28))
                .foregroundColor(PatinaColors.agedOak)
            Text("No projects to show yet")
                .font(PatinaTypography.bodySmall)
                .foregroundColor(PatinaColors.mocha)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 80)
    }

    private func errorView(_ msg: String) -> some View {
        VStack(spacing: 10) {
            Text(msg)
                .font(PatinaTypography.bodySmall)
                .foregroundColor(PatinaColors.mocha)
            Button("Try Again") {
                Task { await viewModel.load() }
            }
            .font(PatinaTypography.bodySmallMedium)
            .foregroundColor(PatinaColors.clay)
        }
        .padding(.top, 60)
        .frame(maxWidth: .infinity)
    }

    private func formatPrice(_ cents: Int) -> String {
        let dollars = cents / 100
        return "$\(dollars.formatted())"
    }
}

#Preview {
    NavigationStack {
        ProjectListView()
            .environment(\.appCoordinator, AppCoordinator())
    }
}
