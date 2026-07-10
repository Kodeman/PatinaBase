//
//  CurrencyFormatting.swift
//  Patina
//
//  Money in Patina is stored as integer cents everywhere (DB convention).
//  This is the single place the client app turns cents into a localized
//  currency string, mirroring the portals' shared `formatCurrency`
//  (Intl.NumberFormat 'currency' over `cents / 100`). Two fraction digits so
//  tax-inclusive invoice totals read exactly ("$1,234.56"), matching the
//  client-portal invoice detail. D.1/D.2 money rail (Wave 2).
//

import Foundation

/// Localized currency formatting for integer cent amounts.
enum PatinaCurrency {

    /// Cents → localized currency, e.g. 123456 → "$1,234.56".
    static func format(cents: Int, currencyCode: String = "USD") -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        formatter.maximumFractionDigits = 2
        formatter.minimumFractionDigits = 2
        let value = Double(cents) / 100.0
        return formatter.string(from: NSNumber(value: value)) ?? "$\(value)"
    }

    /// Cents → whole-dollar currency, e.g. 123456 → "$1,235" (no cents). Used
    /// where a rounded figure reads better (proposal scope-room budgets).
    static func formatWholeDollars(cents: Int, currencyCode: String = "USD") -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        formatter.maximumFractionDigits = 0
        let value = Double(cents) / 100.0
        return formatter.string(from: NSNumber(value: value)) ?? "$\(Int(value))"
    }
}
