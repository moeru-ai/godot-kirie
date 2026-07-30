// NOTICE: This is application source maintained by the basic-host-app-embedded example.
// Its name intentionally matches Godot's Apple Embedded Xcode export-template
// placeholder because the build copies this file over the exported dummy.swift.
// Template: https://github.com/godotengine/godot/blob/master/misc/dist/apple_embedded_xcode/godot_apple_embedded/dummy.swift
// History: https://github.com/godotengine/godot/commit/c99e8aeac3122393f47bd71dcb552bb6ff4cf949

import SwiftUI
import UIKit

@MainActor
private final class GodotControllerStore {
    static let shared = GodotControllerStore()

    let viewController: GDTViewController

    private init() {
        let viewController = GDTViewController()
        self.viewController = viewController
        GDTAppDelegateService.viewController = viewController
    }
}

private struct EmbeddedGodotView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> GDTViewController {
        GodotControllerStore.shared.viewController
    }

    func updateUIViewController(_ uiViewController: GDTViewController, context: Context) {
    }
}

@MainActor
private struct EmbeddedKirieView: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        view.isOpaque = false
        kirie_attach_host_view(view)
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
    }

    static func dismantleUIView(_ uiView: UIView, coordinator: Void) {
        kirie_detach_host_view(uiView)
    }
}

private struct UIKitBadge: UIViewRepresentable {
    let text: String

    func makeUIView(context: Context) -> UILabel {
        let label = UILabel()
        label.backgroundColor = UIColor(red: 0.12, green: 0.18, blue: 0.31, alpha: 1)
        label.layer.cornerRadius = 10
        label.clipsToBounds = true
        label.font = .monospacedSystemFont(ofSize: 12, weight: .semibold)
        label.textAlignment = .center
        label.textColor = UIColor(red: 0.58, green: 0.87, blue: 1, alpha: 1)
        return label
    }

    func updateUIView(_ uiView: UILabel, context: Context) {
        if uiView.text != text {
            uiView.text = text
        }
    }
}

private struct NativeControlsOverlay: View {
    @State private var nativeTapCount = 0
    @State private var overlayTapCount = 0

    var body: some View {
        VStack {
            HStack(spacing: 14) {
                UIKitBadge(text: "UIKit UILabel • tap \(nativeTapCount)")
                    .frame(width: 184, height: 26)

                Spacer(minLength: 12)

                Button("Native button") {
                    nativeTapCount += 1
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .foregroundColor(.white)
                .background(Color(red: 0.08, green: 0.43, blue: 0.62))
                .cornerRadius(10)
            }

            Spacer()

            HStack {
                Button("SwiftUI overlay • tap \(overlayTapCount)") {
                    overlayTapCount += 1
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .foregroundColor(.white)
                .background(Color(red: 0.49, green: 0.28, blue: 0.74))
                .cornerRadius(10)

                Spacer()
            }
        }
        .padding(18)
    }
}

@main
struct BasicHostAppEmbeddedApp: App {
    @UIApplicationDelegateAdaptor(GDTApplicationDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            ZStack {
                EmbeddedGodotView()
                    .ignoresSafeArea()
                    .zIndex(0)
                EmbeddedKirieView()
                    .ignoresSafeArea()
                    .zIndex(1)
                NativeControlsOverlay()
                    .zIndex(2)
            }
        }
    }
}
