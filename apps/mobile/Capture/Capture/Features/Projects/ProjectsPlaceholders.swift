//  ProjectsPlaceholders.swift
//  Capture · Wave P (Projects)
//
//  P1/P2 freeze placeholders. Wave P replaces these with the real project list +
//  detail, reading from `container.projects`.

import SwiftUI
import CaptureKit

struct ProjectListPlaceholder: View {
    var body: some View {
        FieldPlaceholderScreen(screenID: .p1ProjectList, title: "Projects", wave: "P", symbol: "folder")
    }
}

struct ProjectDetailPlaceholder: View {
    let projectID: String
    var body: some View {
        FieldPlaceholderScreen(screenID: .p2ProjectDetail, title: "Project", wave: "P",
                               symbol: "folder", note: "Project \(projectID)")
    }
}
