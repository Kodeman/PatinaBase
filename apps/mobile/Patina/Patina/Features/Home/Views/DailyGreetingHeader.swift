//
//  DailyGreetingHeader.swift
//  Patina
//

import SwiftUI

struct DailyGreetingHeader: View {
    let dateString: String
    let monogram: String

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(dateString)
                    .font(PatinaTypography.monoTiny)
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundColor(PatinaColors.agedOak)
                Text("Your Daily Room")
                    .font(.custom("PlayfairDisplay-Regular", size: 21))
                    .foregroundColor(PatinaColors.charcoal)
                    .lineSpacing(0)
            }
            Spacer()
            ZStack {
                Circle()
                    .fill(PatinaGradients.earth)
                    .frame(width: 36, height: 36)
                Text(monogram)
                    .font(.custom("PlayfairDisplay-Medium", size: 14))
                    .foregroundColor(PatinaColors.offWhite)
            }
        }
        .padding(.top, 56)
        .padding(.horizontal, 20)
    }
}

#Preview {
    DailyGreetingHeader(dateString: "WEDNESDAY · APR 7", monogram: "K")
        .background(PatinaColors.offWhite)
}
