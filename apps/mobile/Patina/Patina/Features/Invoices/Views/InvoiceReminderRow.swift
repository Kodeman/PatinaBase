//
//  InvoiceReminderRow.swift
//  Patina
//
//  "Remind me the day before it's due" — the app's only local notification
//  (B §4), opted into from the invoice it belongs to.
//
//  It draws nothing at all unless the invoice is payable and there is still a
//  day before to remind anyone on. Before it is set, the sentence it will send
//  is printed under the act, in quotes: nobody opts into words they have not
//  read. After it is set, the row says the date and offers the way out.
//
//  The row draws nothing when there is no offer, but it stays MOUNTED — and
//  its `.task` runs on the transition. That is where a reminder is cancelled
//  when its invoice is paid: the offer disappears the moment `isPayable` goes
//  false, and a request left on the queue would put a settled balance on a
//  Lock Screen.
//

import SwiftUI

struct InvoiceReminderRow: View {

    let invoice: RemoteInvoice

    @State private var service = InvoiceReminderService()

    var body: some View {
        let offer = InvoiceReminder.offer(for: invoice)
        return VStack(alignment: .leading, spacing: 6) {
            if let offer {
                if let fireDate = service.fireDate {
                    setRow(fireDate: fireDate, offer: offer)
                } else {
                    offerRow(offer)
                }
                if service.isDenied {
                    Text(InvoiceReminder.deniedLine)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 24)
        .accessibilityIdentifier("invoiceDetail.reminder")
        .task(id: offer) { await service.refresh(invoiceId: invoice.id, offer: offer) }
        .sheet(isPresented: $service.isPresentingPrimer) {
            if let offer {
                InvoiceReminderPrimerView(
                    promise: offer.promise,
                    onAllow: { Task { await service.allowFromPrimer(offer) } },
                    onDismiss: { service.dismissPrimer() }
                )
            }
        }
    }

    private func offerRow(_ offer: InvoiceReminder.Offer) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Button(InvoiceReminder.actLabel) {
                Task { await service.set(offer) }
            }
            .font(PatinaTypography.bodySmallMedium)
            .foregroundStyle(PatinaColors.Text.interactive)
            .frame(minHeight: 44)
            .disabled(service.isBusy)
            .accessibilityIdentifier("invoiceDetail.reminder.set")

            // The consent sentence, at a size it can be read at: it is the
            // point of the affordance, not a footnote to it.
            Text(offer.promise)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func setRow(fireDate: Date, offer: InvoiceReminder.Offer) -> some View {
        HStack(spacing: 18) {
            Text(InvoiceReminder.setLine(fireDate: fireDate))
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.secondary)
                .accessibilityIdentifier("invoiceDetail.reminder.date")

            Button(InvoiceReminder.removeLabel) {
                service.remove(invoiceId: offer.invoiceId)
            }
            .font(PatinaTypography.bodySmallMedium)
            .foregroundStyle(PatinaColors.Text.interactive)
            .accessibilityIdentifier("invoiceDetail.reminder.remove")
        }
        .frame(minHeight: 44)
    }
}
