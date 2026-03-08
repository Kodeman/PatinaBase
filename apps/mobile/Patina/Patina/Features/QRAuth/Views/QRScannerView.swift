//
//  QRScannerView.swift
//  Patina
//
//  Camera-based QR code scanner view for authentication.
//  Provides live camera preview with viewfinder overlay.
//

import SwiftUI
import AVFoundation

/// QR code scanner view with camera preview
public struct QRScannerView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appCoordinator) private var coordinator
    @State private var viewModel = QRScannerViewModel()

    public init() {}

    public var body: some View {
        ZStack {
            // Background
            PatinaColors.Background.primary
                .ignoresSafeArea()

            if viewModel.hasCameraPermission {
                // Camera preview with scanner
                QRCameraPreview(
                    isScanning: $viewModel.isScanning,
                    onCodeScanned: viewModel.handleScannedCode
                )
                .ignoresSafeArea()

                // Viewfinder overlay
                viewfinderOverlay
            } else {
                // Permission request view
                permissionView
            }

            // Instructions card
            VStack {
                Spacer()
                instructionsCard
            }
            .padding(.bottom, PatinaSpacing.xl)

            // Error overlay
            if viewModel.showError {
                errorOverlay
            }

            // Close button
            VStack {
                HStack {
                    Spacer()
                    closeButton
                }
                Spacer()
            }
            .padding(PatinaSpacing.lg)
        }
        .navigationBarHidden(true)
        .sheet(isPresented: $viewModel.showApproval) {
            QRApprovalView(onDismiss: viewModel.onApprovalDismissed)
        }
        .onAppear {
            viewModel.startScanning()
        }
        .onDisappear {
            viewModel.stopScanning()
        }
        .onChange(of: viewModel.shouldDismiss) { _, shouldDismiss in
            if shouldDismiss {
                coordinator.showingQRScanner = false
            }
        }
    }

    // MARK: - Viewfinder Overlay

    private var viewfinderOverlay: some View {
        GeometryReader { geometry in
            let size = min(geometry.size.width, geometry.size.height) * 0.7
            let rect = CGRect(
                x: (geometry.size.width - size) / 2,
                y: (geometry.size.height - size) / 2 - 40,
                width: size,
                height: size
            )

            ZStack {
                // Dimmed background with cutout
                Rectangle()
                    .fill(Color.black.opacity(0.5))
                    .mask(
                        Rectangle()
                            .fill(Color.white)
                            .overlay(
                                RoundedRectangle(cornerRadius: 24)
                                    .frame(width: size, height: size)
                                    .position(x: rect.midX, y: rect.midY)
                                    .blendMode(.destinationOut)
                            )
                            .compositingGroup()
                    )

                // Corner markers
                ViewfinderCorners(rect: rect, cornerRadius: 24)
                    .stroke(PatinaColors.clayBeige, lineWidth: 4)
            }
        }
        .ignoresSafeArea()
    }

    // MARK: - Instructions Card

    private var instructionsCard: some View {
        VStack(spacing: PatinaSpacing.sm) {
            Image(systemName: "qrcode.viewfinder")
                .font(.system(size: 28))
                .foregroundColor(PatinaColors.clayBeige)

            Text("Scan the QR code")
                .font(PatinaTypography.h3)
                .foregroundColor(PatinaColors.Text.primary)

            Text("Point your camera at the QR code on the Patina website")
                .font(PatinaTypography.body)
                .foregroundColor(PatinaColors.Text.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(PatinaSpacing.lg)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(PatinaColors.Background.secondary)
                .shadow(color: .black.opacity(0.2), radius: 10, y: 5)
        )
        .padding(.horizontal, PatinaSpacing.lg)
    }

    // MARK: - Permission View

    private var permissionView: some View {
        VStack(spacing: PatinaSpacing.xl) {
            Image(systemName: "camera.fill")
                .font(.system(size: 64))
                .foregroundColor(PatinaColors.clayBeige)

            VStack(spacing: PatinaSpacing.sm) {
                Text("Camera Access Required")
                    .font(PatinaTypography.h2)
                    .foregroundColor(PatinaColors.Text.primary)

                Text("Patina needs camera access to scan QR codes for secure sign-in.")
                    .font(PatinaTypography.body)
                    .foregroundColor(PatinaColors.Text.secondary)
                    .multilineTextAlignment(.center)
            }

            if viewModel.hasRequestedPermission {
                // Permission was denied - show settings button
                PatinaButton("Open Settings", style: .primary, action: viewModel.openSettings)
            } else {
                // Permission not yet requested
                PatinaButton("Allow Camera Access", style: .primary) {
                    Task {
                        await viewModel.requestCameraPermission()
                    }
                }
            }
        }
        .padding(PatinaSpacing.xl)
    }

    // MARK: - Error Overlay

    private var errorOverlay: some View {
        VStack(spacing: PatinaSpacing.lg) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 48))
                .foregroundColor(PatinaColors.Warning.primary)

            VStack(spacing: PatinaSpacing.sm) {
                Text("Invalid QR Code")
                    .font(PatinaTypography.h3)
                    .foregroundColor(PatinaColors.Text.primary)

                if let errorMessage = viewModel.errorMessage {
                    Text(errorMessage)
                        .font(PatinaTypography.body)
                        .foregroundColor(PatinaColors.Text.secondary)
                        .multilineTextAlignment(.center)
                }
            }

            PatinaButton("Try Again", style: .secondary, action: viewModel.dismissError)
        }
        .padding(PatinaSpacing.xl)
        .background(
            RoundedRectangle(cornerRadius: 24)
                .fill(PatinaColors.Background.primary)
                .shadow(color: .black.opacity(0.3), radius: 20, y: 10)
        )
        .padding(.horizontal, PatinaSpacing.xl)
        .transition(.scale.combined(with: .opacity))
    }

    // MARK: - Close Button

    private var closeButton: some View {
        Button(action: { dismiss() }) {
            Image(systemName: "xmark")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(PatinaColors.Text.primary)
                .frame(width: 36, height: 36)
                .background(
                    Circle()
                        .fill(PatinaColors.Background.secondary.opacity(0.8))
                )
        }
    }
}

// MARK: - Viewfinder Corners Shape

/// Shape for viewfinder corner markers
struct ViewfinderCorners: Shape {
    let rect: CGRect
    let cornerRadius: CGFloat
    let cornerLength: CGFloat = 30

    func path(in bounds: CGRect) -> Path {
        var path = Path()

        // Top-left corner
        path.move(to: CGPoint(x: rect.minX, y: rect.minY + cornerLength))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + cornerRadius))
        path.addQuadCurve(
            to: CGPoint(x: rect.minX + cornerRadius, y: rect.minY),
            control: CGPoint(x: rect.minX, y: rect.minY)
        )
        path.addLine(to: CGPoint(x: rect.minX + cornerLength, y: rect.minY))

        // Top-right corner
        path.move(to: CGPoint(x: rect.maxX - cornerLength, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - cornerRadius, y: rect.minY))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX, y: rect.minY + cornerRadius),
            control: CGPoint(x: rect.maxX, y: rect.minY)
        )
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + cornerLength))

        // Bottom-right corner
        path.move(to: CGPoint(x: rect.maxX, y: rect.maxY - cornerLength))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - cornerRadius))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX - cornerRadius, y: rect.maxY),
            control: CGPoint(x: rect.maxX, y: rect.maxY)
        )
        path.addLine(to: CGPoint(x: rect.maxX - cornerLength, y: rect.maxY))

        // Bottom-left corner
        path.move(to: CGPoint(x: rect.minX + cornerLength, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX + cornerRadius, y: rect.maxY))
        path.addQuadCurve(
            to: CGPoint(x: rect.minX, y: rect.maxY - cornerRadius),
            control: CGPoint(x: rect.minX, y: rect.maxY)
        )
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY - cornerLength))

        return path
    }
}

// MARK: - Camera Preview

/// UIViewRepresentable for AVCaptureSession camera preview
struct QRCameraPreview: UIViewRepresentable {
    @Binding var isScanning: Bool
    let onCodeScanned: (String) -> Void

    func makeUIView(context: Context) -> CameraPreviewView {
        let view = CameraPreviewView()
        view.delegate = context.coordinator
        return view
    }

    func updateUIView(_ uiView: CameraPreviewView, context: Context) {
        if isScanning {
            uiView.startScanning()
        } else {
            uiView.stopScanning()
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onCodeScanned: onCodeScanned)
    }

    class Coordinator: NSObject, CameraPreviewViewDelegate {
        let onCodeScanned: (String) -> Void
        private var lastScannedCode: String?

        init(onCodeScanned: @escaping (String) -> Void) {
            self.onCodeScanned = onCodeScanned
        }

        func cameraPreviewView(_ view: CameraPreviewView, didScanCode code: String) {
            // Prevent duplicate callbacks
            guard code != lastScannedCode else { return }
            lastScannedCode = code

            DispatchQueue.main.async {
                self.onCodeScanned(code)
            }

            // Reset after delay to allow re-scanning same code
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                self.lastScannedCode = nil
            }
        }
    }
}

// MARK: - Camera Preview View

protocol CameraPreviewViewDelegate: AnyObject {
    func cameraPreviewView(_ view: CameraPreviewView, didScanCode code: String)
}

class CameraPreviewView: UIView {
    weak var delegate: CameraPreviewViewDelegate?

    private var captureSession: AVCaptureSession?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private let metadataOutput = AVCaptureMetadataOutput()

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupCaptureSession()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupCaptureSession()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        previewLayer?.frame = bounds
    }

    private func setupCaptureSession() {
        let session = AVCaptureSession()
        session.sessionPreset = .high

        guard let videoCaptureDevice = AVCaptureDevice.default(for: .video),
              let videoInput = try? AVCaptureDeviceInput(device: videoCaptureDevice),
              session.canAddInput(videoInput) else {
            return
        }

        session.addInput(videoInput)

        if session.canAddOutput(metadataOutput) {
            session.addOutput(metadataOutput)
            metadataOutput.setMetadataObjectsDelegate(self, queue: .main)
            metadataOutput.metadataObjectTypes = [.qr]
        }

        let previewLayer = AVCaptureVideoPreviewLayer(session: session)
        previewLayer.videoGravity = .resizeAspectFill
        previewLayer.frame = bounds
        layer.addSublayer(previewLayer)

        self.previewLayer = previewLayer
        self.captureSession = session
    }

    func startScanning() {
        guard let session = captureSession, !session.isRunning else { return }
        DispatchQueue.global(qos: .userInitiated).async {
            session.startRunning()
        }
    }

    func stopScanning() {
        guard let session = captureSession, session.isRunning else { return }
        DispatchQueue.global(qos: .userInitiated).async {
            session.stopRunning()
        }
    }
}

extension CameraPreviewView: AVCaptureMetadataOutputObjectsDelegate {
    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard let metadataObject = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let stringValue = metadataObject.stringValue else {
            return
        }

        delegate?.cameraPreviewView(self, didScanCode: stringValue)
    }
}

// MARK: - Preview

#Preview {
    QRScannerView()
}
