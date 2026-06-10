//
//  ARPlacementView.swift
//  Patina
//
//  AR furniture placement view using RealityKit
//  Companion enters Minimal state during AR
//

import SwiftUI
import RealityKit
import ARKit

struct ARPlacementView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appCoordinator) private var coordinator
    @State private var viewModel = ARPlacementViewModel()
    @State private var placementManager = ARPlacementManager()

    let productId: String
    /// Remote room id (Supabase `rooms.id`) — when present, the session
    /// attempts to load the most recent scan mesh for the room and a
    /// "Save View" action persists the placement as a saved_item.
    var roomRemoteId: String? = nil

    var body: some View {
        ZStack {
            // AR View
            ARViewContainer(manager: placementManager)
                .ignoresSafeArea()

            // Top controls
            VStack {
                HStack {
                    // Back button
                    Button { dismiss() } label: {
                        floatingButton(icon: "chevron.left")
                    }

                    Spacer()

                    // Product name pill
                    if let product = viewModel.product {
                        Text(product.name)
                            .font(PatinaTypography.h5)
                            .foregroundStyle(PatinaColors.Text.primary)
                            .padding(.horizontal, 18)
                            .padding(.vertical, 8)
                            // PT-5-7: Liquid Glass replaces the
                            // `.ultraThinMaterial` capsule on the floating
                            // AR control surfaces.
                            .arGlassCapsule()
                    }

                    Spacer()

                    // Screenshot button
                    Button {
                        placementManager.captureScreenshot()
                        HapticManager.shared.notification(.success)
                    } label: {
                        floatingButton(icon: "camera")
                    }
                }
                .padding(.top, 56)
                .padding(.horizontal, 16)

                Spacer()

                // Bottom controls
                if placementManager.isPlaced {
                    bottomControls
                } else if placementManager.isLoading {
                    loadingIndicator
                } else if let product = viewModel.product, product.hasARModel {
                    placeButton
                } else {
                    noModelMessage
                }
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .overlay(alignment: .top) { saveToast }
        // PT-5-10: declarative success haptic when a product lands on a
        // surface. Replaces the imperative `notification(.success)` that
        // previously lived in ARPlacementManager.placeProduct.
        .sensoryFeedback(.success, trigger: placementManager.isPlaced) { _, placed in
            placed
        }
        .task {
            if let roomRemoteId {
                viewModel.attachRoom(remoteId: roomRemoteId)
            }
            await viewModel.loadProduct(id: productId)
        }
        .onChange(of: viewModel.loadedMeshURL) { _, newURL in
            if let newURL {
                placementManager.loadRoomMesh(from: newURL)
            }
        }
    }

    @ViewBuilder
    private var saveToast: some View {
        switch viewModel.saveState {
        case .idle:
            EmptyView()
        case .saving:
            toastPill(text: "Saving view…", tint: PatinaColors.charcoal)
        case .saved:
            toastPill(text: "Saved to your room ✓", tint: PatinaColors.success)
        case .failed(let msg):
            toastPill(text: "Save failed: \(msg)", tint: PatinaColors.clay)
        }
    }

    private func toastPill(text: String, tint: Color) -> some View {
        Text(text)
            .font(PatinaTypography.uiSmall)
            .foregroundStyle(PatinaColors.offWhite)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Capsule().fill(tint.opacity(0.95)))
            .padding(.top, 110)
            .transition(.move(edge: .top).combined(with: .opacity))
    }

    // MARK: - Controls

    private var bottomControls: some View {
        HStack(spacing: 12) {
            // Rotate
            Button {
                placementManager.rotate(by: .pi / 4)
                HapticManager.shared.impact(.light)
            } label: {
                floatingButton(icon: "arrow.counterclockwise")
            }

            // Done / Save view
            Button {
                viewModel.trackARPlacement()
                if roomRemoteId != nil {
                    Task {
                        await viewModel.saveCurrentPlacement()
                        // Auto-dismiss shortly after a successful save
                        if case .saved = viewModel.saveState {
                            try? await Task.sleep(nanoseconds: 900_000_000)
                            dismiss()
                        }
                    }
                } else {
                    dismiss()
                }
            } label: {
                Text("Save View")
                    .font(PatinaTypography.uiAction)
                    .foregroundStyle(PatinaColors.offWhite)
                    .padding(.horizontal, 24)
                    .frame(height: 48)
                    .background(PatinaColors.charcoal)
                    .clipShape(Capsule())
            }

            // Screenshot
            Button {
                placementManager.captureScreenshot()
            } label: {
                floatingButton(icon: "camera")
            }
        }
        .padding(.bottom, 54)
    }

    private var placeButton: some View {
        Button {
            guard let urlString = viewModel.product?.usdzURL,
                  let url = URL(string: urlString) else { return }
            Task {
                await placementManager.placeProduct(usdzURL: url)
            }
        } label: {
            Text("Tap a surface to place")
                .font(PatinaTypography.uiAction)
                .foregroundStyle(PatinaColors.offWhite)
                .padding(.horizontal, 24)
                .frame(height: 48)
                .background(PatinaColors.charcoal.opacity(0.8))
                .clipShape(Capsule())
        }
        .padding(.bottom, 54)
    }

    private var loadingIndicator: some View {
        ProgressView()
            .tint(PatinaColors.Text.interactive)
            .padding(.bottom, 54)
    }

    private var noModelMessage: some View {
        Text("3D model not available for this product")
            .font(PatinaTypography.bodySmall)
            .foregroundStyle(PatinaColors.offWhite)
            .padding(.horizontal, 24)
            .padding(.vertical, 10)
            // PT-5-7: Liquid Glass on the AR message pill.
            .arGlassCapsule()
            .padding(.bottom, 54)
    }

    // MARK: - Helpers

    private func floatingButton(icon: String) -> some View {
        // PT-5-7: the floating AR control buttons adopt Liquid Glass in
        // place of `.ultraThinMaterial`. The icon sits on the glass via an
        // overlay so it stays crisp over the live camera feed.
        Color.clear
            .frame(width: 48, height: 48)
            .arGlassCircle()
            .overlay(
                Image(systemName: icon)
                    .font(.system(size: 18))
                    .foregroundStyle(PatinaColors.Text.primary)
            )
    }
}

// MARK: - Liquid Glass helpers (PT-5-7)

private extension View {
    /// Liquid Glass capsule for the floating AR control pills. The
    /// `#available` guard exists because the project compiles these views
    /// against an availability floor below the iOS-26 `glassEffect`; on the
    /// 26.2 target the glass path is always taken. The `.ultraThinMaterial`
    /// arm is a compile-floor fallback only.
    @ViewBuilder
    func arGlassCapsule() -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular, in: .capsule)
        } else {
            self.background(.ultraThinMaterial).clipShape(Capsule())
        }
    }

    /// Liquid Glass circle for the floating AR control buttons. See
    /// `arGlassCapsule()` for why the `#available` guard is present.
    @ViewBuilder
    func arGlassCircle() -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular, in: .circle)
        } else {
            self.background(.ultraThinMaterial).clipShape(Circle())
        }
    }
}

// MARK: - ARView Container (UIViewRepresentable)

struct ARViewContainer: UIViewRepresentable {
    let manager: ARPlacementManager

    func makeUIView(context: Context) -> ARView {
        let arView = ARView(frame: .zero)
        arView.automaticallyConfigureSession = false
        manager.configure(arView: arView)
        return arView
    }

    func updateUIView(_ uiView: ARView, context: Context) {}
}

#Preview {
    ARPlacementView(productId: "p1")
        .environment(\.appCoordinator, AppCoordinator())
}
