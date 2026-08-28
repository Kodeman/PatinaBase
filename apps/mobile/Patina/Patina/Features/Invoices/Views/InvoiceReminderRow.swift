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

import SwiftUI

struct InvoiceReminderRow: View {

    let invoice: RemoteInvoice

    @State private var service = InvoiceReminderService()

    var body: some View {
        if let offer = InvoiceReminder.offer(for: invoice) {
            VStack(alignment: .leading, spacing: 6) {
                if let fireDate = service.fireDate {
                    setRow(fireDate: fireDate, offer: offer)
                } else {
                    offerRow(offer)
                }
                if service.isDenied {
                    Text(InvoiceReminder.deniedLine)
                        .font(PatinaTypography.captionSmall)
                        .foregroundStyle(PatinaColors.Text.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 24)
            .accessibilityIdentifier("invoiceDetail.reminder")
            .task(id: offer.invoiceId) { await service.refresh(offer: offer) }
            .sheet(isPresented: $service.isPresentingPrimer) {
                PushPrimerView { Task { await service.primerDecided(offer) } }
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

            Text(offer.promise)
                .font(PatinaTypography.captionSmall)
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
