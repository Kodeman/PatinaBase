//
//  AddToCalendarButton.swift
//  Patina
//
//  "Add to calendar" for a booked discovery call (Arrival Arc, R106 §6).
//
//  Presents `EKEventEditViewController` in a sheet with the event pre-filled.
//  On iOS 17+ this controller runs OUT OF PROCESS: the system draws the editor,
//  writes the event on the user's confirmation, and returns — the app never
//  touches the user's calendar data. That means NO `EKEventStore` authorization
//  request, NO permission prompt, and NO `NSCalendarsUsageDescription` Info.plist
//  string. The app's deployment target is iOS 26.2, comfortably past that floor,
//  so no availability guard or permission plumbing is needed here.
//
//  Delegate reference: `EKEventEditViewDelegate` (the out-of-process editor),
//  distinct from the calendar-access APIs it deliberately avoids.
//

import SwiftUI
import EventKit
import EventKitUI

/// A secondary button that opens the system calendar-event editor pre-filled
/// with a discovery call. The user reviews and saves (or cancels) in the
/// out-of-process editor; nothing is written without their confirmation.
struct AddToCalendarButton: View {
    /// Event title, e.g. "Discovery call — Middle Studio".
    let title: String
    /// The picked slot's start.
    let startsAt: Date
    /// Call length in minutes; drives the event's end date.
    let durationMinutes: Int
    /// Free-text notes (mentions Patina).
    let notes: String
    /// Button label — defaults to "Add to calendar".
    var label: String = "Add to calendar"

    @State private var isPresentingEditor = false

    var body: some View {
        PatinaButton(
            label,
            style: .secondary,
            icon: Image(systemName: "calendar.badge.plus")
        ) {
            isPresentingEditor = true
        }
        .sheet(isPresented: $isPresentingEditor) {
            EventEditSheet(
                title: title,
                startsAt: startsAt,
                durationMinutes: durationMinutes,
                notes: notes
            ) {
                isPresentingEditor = false
            }
            .ignoresSafeArea()
        }
        .accessibilityHint("Opens the calendar editor to save this call.")
    }
}

/// `UIViewControllerRepresentable` wrapper around the out-of-process
/// `EKEventEditViewController`. No authorization APIs are used.
private struct EventEditSheet: UIViewControllerRepresentable {
    let title: String
    let startsAt: Date
    let durationMinutes: Int
    let notes: String
    let onComplete: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onComplete: onComplete)
    }

    func makeUIViewController(context: Context) -> EKEventEditViewController {
        // A local store instance is required to construct the EKEvent; the
        // out-of-process editor performs the actual (authorized) write.
        let store = EKEventStore()
        let controller = EKEventEditViewController()
        controller.eventStore = store

        let event = EKEvent(eventStore: store)
        event.title = title
        event.startDate = startsAt
        event.endDate = startsAt.addingTimeInterval(TimeInterval(durationMinutes * 60))
        event.notes = notes
        controller.event = event
        controller.editViewDelegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: EKEventEditViewController, context: Context) {}

    final class Coordinator: NSObject, EKEventEditViewDelegate {
        let onComplete: () -> Void

        init(onComplete: @escaping () -> Void) {
            self.onComplete = onComplete
        }

        func eventEditViewController(
            _ controller: EKEventEditViewController,
            didCompleteWith action: EKEventEditViewAction
        ) {
            onComplete()
        }
    }
}

#Preview {
    AddToCalendarButton(
        title: "Discovery call — Middle Studio",
        startsAt: Date().addingTimeInterval(3600 * 48),
        durationMinutes: 45,
        notes: "Your first call with Middle Studio, booked through Patina."
    )
    .padding(24)
    .background(PatinaColors.Background.primary)
}
