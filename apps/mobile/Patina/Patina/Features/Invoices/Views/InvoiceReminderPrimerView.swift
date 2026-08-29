//
//  InvoiceReminderPrimerView.swift
//  Patina
//
//  The reminder's own ask.
//
//  Steward §7: "a reminder the person opted into on the invoice can ask for
//  authorization on its own terms — but if it does, its copy says exactly what
//  it will say and nothing else." So this screen carries the sentence the
//  notification will carry, in quotes, and asks for `[.alert]` only. It does
//  not reuse `PushPrimerView`: that screen's promise is about what a designer
//  sends, its button registers for remote notifications, and it spends Q7's
//  once-per-install ask — none of which is what this is.
//

import SwiftUI

struct InvoiceReminderPrimerView: View {

    /// `InvoiceReminder.Offer.promise` — the exact sentence, quoted, with this
    /// invoice's own balance in it.
    let promise: String
    let onAllow: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.lg) {
            Spacer(minLength: 0)

            Image(systemName: "bell")
                .font(.system(size: 34))
                .foregroundStyle(PatinaColors.Text.interactive)
                .accessibilityHidden(true)

            Text(InvoiceReminder.primerTitle)
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)

            Text(promise)
                .font(PatinaTypography.body)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Text(InvoiceReminder.primerDetail)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.muted)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)

            VStack(spacing: PatinaSpacing.sm) {
                PatinaButton(InvoiceReminder.primerAllowLabel, style: .primary, action: onAllow)
                    .accessibilityIdentifier("invoiceDetail.reminder.primer.allow")

                Button(InvoiceReminder.primerDismissLabel, action: onDismiss)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .contentShape(Rectangle())
                    .accessibilityIdentifier("invoiceDetail.reminder.primer.dismiss")
            }
        }
        .padding(.horizontal, PatinaSpacing.lg)
        .padding(.vertical, PatinaSpacing.xxl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(PatinaColors.Background.primary)
    }
}
