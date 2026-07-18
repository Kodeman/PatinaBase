//  SiteRequestScreens.swift
//  Capture
//
//  Deterministic SR01–SR20 surfaces for the P1 designer/guest loop. Production
//  reads/actions stay behind SiteRequestService; guest upload/delivery state is
//  backed by the SwiftData outbox and an opaque Edge access token.

import SwiftUI
import CaptureKit
import CaptureKitMocks

enum SiteRequestScreens {
    @MainActor
    static func register(into registry: RouteRegistry,
                         container: AppContainer,
                         coordinator: CaptureCoordinator) {
        registry.registerRoute(CaptureRoute.site(
            screen: .sr01SiteHub, projectID: nil, requestID: nil).registryKey) { route in
            guard case let .site(screen, projectID, requestID) = route else {
                return AnyView(EmptyView())
            }
            return AnyView(SiteRequestScreen(
                screen: screen,
                projectID: projectID ?? SiteRequestFixtures.projectID,
                requestID: requestID ?? SiteRequestFixtures.requestID,
                accessToken: coordinator.guestAccessToken,
                container: container,
                coordinator: coordinator))
        }
    }
}

struct GuestSiteRequestRootView: View {
    let accessToken: String
    let container: AppContainer
    let coordinator: CaptureCoordinator

    var body: some View {
        SiteRequestScreen(
            screen: .sr13GuestLanding,
            projectID: SiteRequestFixtures.projectID,
            requestID: SiteRequestFixtures.requestID,
            accessToken: accessToken,
            container: container,
            coordinator: coordinator)
    }
}

private struct SiteRequestScreen: View {
    let screen: CaptureScreenID
    let projectID: String
    let requestID: String
    let accessToken: String?
    let container: AppContainer
    let coordinator: CaptureCoordinator

    @State private var hub = SiteRequestFixtures.hub
    @State private var guest = SiteRequestFixtures.guest
    @State private var redoNote = SiteRequestFixtures.redoNote
    @State private var imperialA = "41 3/8"
    @State private var imperialB = "25 3/4"
    @State private var imperialC = "96 1/4"
    @State private var metricEntry = false
    @State private var actionMessage: String?
    @State private var isWorking = false

    var body: some View {
        ZStack {
            CaptureColor.paper.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    content
                    if let actionMessage {
                        Text(actionMessage)
                            .font(CaptureType.footnote)
                            .foregroundStyle(CaptureColor.verdigrisInk)
                            .accessibilityIdentifier("siteRequest.actionMessage")
                    }
                }
                .padding(20)
            }
        }
        .navigationTitle(navigationTitle)
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier(screen.rawValue)
        .task { await loadContractData() }
    }

    private var navigationTitle: String {
        isGuest ? "Site Request" : "Site"
    }

    private var isGuest: Bool {
        switch screen {
        case .sr13GuestLanding, .sr14GuestChecklist, .sr15GuestMeasure,
             .sr16GuestPhoto, .sr17GuestQueue, .sr18GuestReceipt,
             .sr19GuestDone, .sr20GuestReturned:
            return true
        default:
            return false
        }
    }

    @ViewBuilder private var header: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(isGuest ? "PATINA · SITE REQUEST" : "FIELD · \(hub.projectName.uppercased())")
                .font(CaptureType.eyebrow)
                .foregroundStyle(CaptureColor.verdigrisInk)
            Rectangle().fill(CaptureColor.line).frame(height: 1)
        }
    }

    @ViewBuilder private var content: some View {
        switch screen {
        case .sr01SiteHub: siteHub
        case .sr02Composer: composer
        case .sr03ItemConfig: itemConfig
        case .sr04AssignSend: assignAndSend
        case .sr05Tracker: tracker
        case .sr06ReviewInbox: reviewInbox
        case .sr07MeasureReview: measureReview
        case .sr08PhotoReview: photoReview
        case .sr09Approval: approval
        case .sr10BinderRooms: binderRooms
        case .sr11BinderDetail: binderDetail
        case .sr12BinderHistory: binderHistory
        case .sr13GuestLanding: guestLanding
        case .sr14GuestChecklist: guestChecklist
        case .sr15GuestMeasure: guestMeasure
        case .sr16GuestPhoto: guestPhoto
        case .sr17GuestQueue: guestQueue
        case .sr18GuestReceipt: guestReceipt
        case .sr19GuestDone: guestDone
        case .sr20GuestReturned: guestReturned
        default: EmptyView()
        }
    }

    private var siteHub: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("Site", subtitle: "Project-scoped requests and ground truth")
            sectionLabel("OPEN REQUESTS")
            ForEach(hub.requests) { request in
                card {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(request.title).font(CaptureType.bodyEmph)
                            Text("\(request.assignee.name) · \(request.deliveredItemCount) of \(request.itemCount) delivered")
                                .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
                        }
                        Spacer()
                        status(request.status.rawValue)
                    }
                }
            }
            Button("New site request") { go(.sr02Composer) }.sitePrimary()
            Button("Open Site Binder") { go(.sr10BinderRooms) }.siteSecondary()
            sectionLabel("ACTIVITY")
            ForEach(hub.events) { event in
                Text("\(event.actorName) \(event.message)")
                    .font(CaptureType.callout)
            }
        }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("New site request", subtitle: "\(hub.projectName) · rooms preloaded")
            sectionLabel("BUILT-IN KITS")
            kitRow(.measureSet, detail: "Three dimensions · optional tape proof")
            kitRow(.detailPhotos, detail: "Four guided angles · reference framing")
            sectionLabel("DUE")
            field("Friday, August 29 · before drywall")
            sectionLabel("ASSIGNEE")
            field("Dan K. · +1 608 555 0142")
            Button("Configure 2 items") { go(.sr03ItemConfig) }.sitePrimary()
        }
    }

    private var itemConfig: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("Configure items", subtitle: "Definitions freeze at send; later edits create a new version")
            card {
                VStack(alignment: .leading, spacing: 9) {
                    Text(SiteRequestKit.measureSet.title).font(CaptureType.bodyEmph)
                    Text("Kitchen · west wall").font(CaptureType.title2)
                    Text("A floor → sill · B sill → head · C run length")
                        .font(CaptureType.callout).foregroundStyle(CaptureColor.inkSoft)
                    Text("Inside face to inside face — ignore the trim.")
                        .font(CaptureType.callout)
                }
            }
            card {
                VStack(alignment: .leading, spacing: 9) {
                    Text(SiteRequestKit.detailPhotos.title).font(CaptureType.bodyEmph)
                    Text("Primary bath · vanity alcove").font(CaptureType.title2)
                    Text("Wide context · straight on · left return · grout detail")
                        .font(CaptureType.callout).foregroundStyle(CaptureColor.inkSoft)
                }
            }
            Text("Custom saved kits and markup arrive after the P1 pilot.")
                .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
            Button("Assign and preview") { go(.sr04AssignSend) }.sitePrimary()
        }
    }

    private var assignAndSend: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("Send request", subtitle: "2 items · due Friday")
            card {
                VStack(alignment: .leading, spacing: 6) {
                    Text(SiteRequestFixtures.assignee.name).font(CaptureType.bodyEmph)
                    Text("\(SiteRequestFixtures.assignee.normalizedPhone) · \(SiteRequestFixtures.assignee.trade ?? "Trade")")
                        .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
                    Label("SMS consent on file", systemImage: "checkmark.circle.fill")
                        .font(CaptureType.callout).foregroundStyle(CaptureColor.success)
                }
            }
            sectionLabel("EXACT SMS PREVIEW")
            card {
                Text("Leah at Middlewest Studio needs 2 site items for Killkenny West — due Friday. Open your private checklist: client.patina.cloud/field/••••")
                    .font(CaptureType.callout)
            }
            Text("Without consent, this request waits in awaiting consent until Dan replies YES.")
                .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
            Button("Send request") { go(.sr05Tracker) }.sitePrimary()
        }
    }

    private var tracker: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("Pre-drywall pass", subtitle: "Dan K. · opened 12 minutes ago")
            ProgressView(value: 0.5).tint(CaptureColor.verdigris)
            Text("1 of 2 delivered").font(CaptureType.monoBody)
            requestItemRow(SiteRequestFixtures.measureItem, trailing: "DELIVERED")
            requestItemRow(SiteRequestFixtures.photoItem, trailing: "RETURNED")
            sectionLabel("ACTIVITY")
            ForEach(hub.events) { event in
                Text("\(event.actorName) · \(event.message)").font(CaptureType.callout)
            }
            Button("Review delivery") { go(.sr06ReviewInbox) }.sitePrimary()
            Button("Nudge available tomorrow") {}.siteSecondary().disabled(true)
        }
    }

    private var reviewInbox: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("Review", subtitle: "2 item deliveries keep their provenance")
            requestItemRow(SiteRequestFixtures.measureItem, trailing: "REVIEW")
            requestItemRow(SiteRequestFixtures.photoItem, trailing: "REVIEW")
            Text("Approvals are item-granular. There is no bulk approve.")
                .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
            Button("Review measure set") { go(.sr07MeasureReview) }.sitePrimary()
        }
    }

    private var measureReview: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("Measure · Kitchen west wall", subtitle: "Dan K. · captured Friday 2:41 PM")
            ForEach(SiteRequestFixtures.dimensions) { dimension in
                card {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(dimension.label).font(CaptureType.eyebrow)
                            Text(SiteMeasurement.imperialString(millimetres: dimension.millimetres))
                                .font(CaptureType.title2)
                            Text("\(dimension.capturedBy) · proof \(dimension.proofAssetPath == nil ? "not attached" : "attached")")
                                .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
                        }
                        Spacer()
                    }
                }
            }
            HStack {
                Button("Approve") { Task { await approveMeasure() } }.sitePrimary()
                Button("Redo…") { go(.sr08PhotoReview) }.siteSecondary()
            }
        }
    }

    private var photoReview: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("Photos · Vanity alcove", subtitle: "4 immutable originals · display derivatives")
            mediaGrid
            sectionLabel("SEND BACK — NOTE REQUIRED")
            HStack { reasonChip("Glare"); reasonChip("Wrong angle"); reasonChip("Closer") }
            TextEditor(text: $redoNote)
                .font(CaptureType.body)
                .frame(minHeight: 96)
                .padding(8)
                .overlay(Rectangle().stroke(CaptureColor.line2))
                .accessibilityIdentifier("siteRequest.redoNote")
            Text("The pro receives this text verbatim. Only this item reopens.")
                .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
            Button("Send back with note") { Task { await sendRedo() } }
                .sitePrimary().disabled(redoNote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            Button("Approve instead") { Task { await approvePhoto() } }.siteSecondary()
        }
    }

    private var approval: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("Filed to the Binder", subtitle: "Exactly one append-only entry created")
            card {
                Label("Kitchen · Measure Set", systemImage: "checkmark.seal.fill")
                    .font(CaptureType.bodyEmph).foregroundStyle(CaptureColor.success)
            }
            provenance
            Button("View Binder rooms") { go(.sr10BinderRooms) }.sitePrimary()
        }
    }

    private var binderRooms: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("Site Binder", subtitle: "Rooms are the spine; entries append")
            ForEach(hub.rooms) { room in
                Button { go(.sr11BinderDetail) } label: {
                    card {
                        HStack {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(room.name).font(CaptureType.bodyEmph).foregroundStyle(CaptureColor.ink)
                                Text("\(room.dimensionCount) dims · \(room.photoCount) photos")
                                    .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
                            }
                            Spacer(); Image(systemName: "chevron.right").foregroundStyle(CaptureColor.inkSoft)
                        }
                    }
                }.buttonStyle(.plain)
            }
        }
    }

    private var binderDetail: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("Kitchen", subtitle: "Current approved values with their source")
            ForEach(SiteRequestFixtures.dimensions) { dimension in
                card {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(dimension.label).font(CaptureType.eyebrow)
                        Text(SiteMeasurement.imperialString(millimetres: dimension.millimetres))
                            .font(CaptureType.title2)
                        Text("Captured by \(dimension.capturedBy) · approved by Leah")
                            .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
                    }
                }
            }
            Button("View append-only history") { go(.sr12BinderHistory) }.sitePrimary()
        }
    }

    private var binderHistory: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("Kitchen · history", subtitle: "Prior attempts remain retrievable")
            historyRow("96 1/4 in", detail: "Current · Dan K. · approved Friday", current: true)
            historyRow("95 3/4 in", detail: "Superseded · Dan K. · May 12", current: false)
            historyRow("96 in", detail: "Original site note · Leah · April 8", current: false)
            provenance
        }
    }

    private var guestLanding: some View {
        VStack(alignment: .leading, spacing: 22) {
            title("\(guest.designerName) · \(guest.studioName)",
                  subtitle: "requests \(guest.items.count) site items for \(guest.projectDisplayName)")
            card {
                VStack(alignment: .leading, spacing: 8) {
                    Text("You’ll see this request only.").font(CaptureType.bodyEmph)
                    Text("No account or installation is required. You can stop and return from the same private link.")
                        .font(CaptureType.callout).foregroundStyle(CaptureColor.inkSoft)
                }
            }
            Button("Open checklist") { go(.sr14GuestChecklist) }.sitePrimary()
        }
    }

    private var guestChecklist: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("For the \(guest.projectDisplayName) site", subtitle: "From \(guest.designerName) · due Friday")
            Text("1 of 2 server-received").font(CaptureType.monoBody)
            ProgressView(value: 0.5).tint(CaptureColor.verdigris)
            requestItemRow(SiteRequestFixtures.measureItem, trailing: "DELIVERED")
            requestItemRow(SiteRequestFixtures.photoItem, trailing: "RETURNED")
            Text("Captured work stays on this phone through dead zones and relaunches. Delivered means the server acknowledged it.")
                .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
            Button("Continue · Kitchen west wall") { go(.sr15GuestMeasure) }.sitePrimary()
        }
    }

    private var guestMeasure: some View {
        VStack(alignment: .leading, spacing: 16) {
            title("Kitchen · west wall", subtitle: SiteRequestFixtures.measureItem.guidance)
            Picker("Units", selection: $metricEntry) {
                Text("Imperial").tag(false); Text("Metric").tag(true)
            }.pickerStyle(.segmented)
            measureField("A · FLOOR → SILL", text: $imperialA)
            measureField("B · SILL → HEAD", text: $imperialB)
            measureField("C · RUN LENGTH", text: $imperialC)
            Text("Imperial entry snaps to 1/16 in. Storage is canonical integer millimetres.")
                .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
            Button("Queue measurement delivery") { Task { await queueMeasurement() } }
                .sitePrimary().disabled(isWorking)
        }
    }

    private var guestPhoto: some View {
        VStack(alignment: .leading, spacing: 16) {
            title("Photos · Vanity alcove", subtitle: "Shot 2 of 4 · Straight on — include the sconce")
            ZStack {
                CaptureColor.ink2
                RoundedRectangle(cornerRadius: 80)
                    .stroke(CaptureColor.paper.opacity(0.7), lineWidth: 2)
                    .frame(width: 180, height: 210)
                VStack {
                    Text("GHOST FRAME").font(CaptureType.eyebrow).foregroundStyle(CaptureColor.paper)
                    Spacer()
                    Image(systemName: "camera.circle.fill").font(.system(size: 58)).foregroundStyle(CaptureColor.paper)
                }.padding(24)
            }
            .frame(height: 300)
            Text("Low light — steady the phone or turn on the work lamp.")
                .font(CaptureType.callout).foregroundStyle(CaptureColor.warning)
            Button("Capture and queue photo") { Task { await queuePhoto() } }
                .sitePrimary().disabled(isWorking)
            Button("Skip this shot · records the reason") { go(.sr17GuestQueue) }.siteSecondary()
        }
    }

    private var guestQueue: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("Delivery queue", subtitle: "Durable across relaunch")
            queueRow("Measurements", state: "AWAITING RECEIPT", tint: CaptureColor.warning)
            queueRow("Vanity photo 2", state: "UPLOADING", tint: CaptureColor.verdigrisInk)
            queueRow("Vanity photo 3", state: "QUEUED · OFFLINE", tint: CaptureColor.inkSoft)
            Text("Retries keep the same client delivery ID and checksum. Duplicate taps cannot create duplicate deliveries.")
                .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
            Button("View receipt state") { go(.sr18GuestReceipt) }.sitePrimary()
        }
    }

    private var guestReceipt: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("Received by Patina", subtitle: "Server receipt · \(SiteRequestFixtures.deliverableID)")
            card {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Checksum verified", systemImage: "checkmark.circle.fill")
                    Label("Item version 1 received", systemImage: "checkmark.circle.fill")
                    Label("Designer notification queued", systemImage: "bell.badge")
                }.font(CaptureType.callout).foregroundStyle(CaptureColor.success)
            }
            Button("Back to checklist") { go(.sr19GuestDone) }.sitePrimary()
        }
    }

    private var guestDone: some View {
        VStack(alignment: .center, spacing: 18) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 72)).foregroundStyle(CaptureColor.success)
            Text("2 of 2 delivered").font(CaptureType.title)
            Text("Leah has been notified. This link stays available for a returned item until the request closes.")
                .font(CaptureType.callout).foregroundStyle(CaptureColor.inkSoft)
                .multilineTextAlignment(.center)
            Button("See returned-item example") { go(.sr20GuestReturned) }.siteSecondary()
        }.frame(maxWidth: .infinity)
    }

    private var guestReturned: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("1 item returned", subtitle: "Everything else stands")
            requestItemRow(SiteRequestFixtures.photoItem, trailing: "RETURNED")
            card {
                Text(SiteRequestFixtures.redoNote)
                    .font(CaptureType.bodyEmph)
                    .accessibilityIdentifier("siteRequest.verbatimRedoNote")
            }
            Text("The previous attempt remains in history. This exact item alone is open again.")
                .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
            Button("Recapture this item") { go(.sr16GuestPhoto) }.sitePrimary()
        }
    }

    // MARK: - Contract actions

    private func loadContractData() async {
        container.analytics.screen(screen.rawValue)
        do {
            if isGuest, let accessToken {
                guest = try await container.guestSiteRequests.bootstrap(accessToken: accessToken)
                await container.siteRequestOutboxDrainer.resume(accessToken: accessToken)
            } else if !isGuest {
                hub = try await container.siteRequests.hub(projectID: projectID)
            }
        } catch {
            actionMessage = "Offline fixture shown · \(error.localizedDescription)"
        }
    }

    private func approveMeasure() async {
        do {
            try await container.siteRequests.approve(
                itemID: SiteRequestFixtures.measureItemID,
                deliverableID: SiteRequestFixtures.deliverableID,
                roomID: "room-1")
            go(.sr09Approval)
        } catch { actionMessage = error.localizedDescription }
    }

    private func approvePhoto() async {
        do {
            try await container.siteRequests.approve(
                itemID: SiteRequestFixtures.photoItemID,
                deliverableID: SiteRequestFixtures.deliverableID,
                roomID: "room-2")
            go(.sr09Approval)
        } catch { actionMessage = error.localizedDescription }
    }

    private func sendRedo() async {
        do {
            try await container.siteRequests.redo(itemID: SiteRequestFixtures.photoItemID, note: redoNote)
            actionMessage = "Returned verbatim · only Vanity alcove reopened"
        } catch { actionMessage = error.localizedDescription }
    }

    private func queueMeasurement() async {
        isWorking = true
        defer { isWorking = false }
        do {
            let parser = metricEntry ? SiteMeasurement.millimetres(fromMetric:) : SiteMeasurement.millimetres(fromImperial:)
            let values = try [imperialA, imperialB, imperialC].map(parser)
            let labels = ["A · floor → sill", "B · sill → head", "C · run length"]
            let dimensions = zip(labels, values).enumerated().map { index, pair in
                SiteRequestDimension(id: "local-dim-\(index)", label: pair.0,
                                     millimetres: pair.1, capturedBy: "Guest", capturedAt: Date())
            }
            try enqueue(submission: SiteDeliverySubmission(
                requestID: requestID,
                itemID: SiteRequestFixtures.measureItemID,
                itemVersionID: SiteRequestFixtures.measureVersionID,
                clientDeliveryID: UUID(),
                dimensions: dimensions))
            go(.sr17GuestQueue)
        } catch { actionMessage = error.localizedDescription }
    }

    private func queuePhoto() async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await container.camera.configure(mode: .photo)
            await container.camera.start()
            let frame = try await container.camera.capture()
            container.camera.stop()
            let mediaURL = try container.store.writeMedia(
                frame.data, filename: "site-request-\(UUID().uuidString).heic")
            try enqueue(submission: SiteDeliverySubmission(
                requestID: requestID,
                itemID: SiteRequestFixtures.photoItemID,
                itemVersionID: SiteRequestFixtures.photoVersionID,
                clientDeliveryID: UUID()),
                mediaPaths: [mediaURL.path])
            go(.sr17GuestQueue)
        } catch { actionMessage = error.localizedDescription }
    }

    private func enqueue(submission: SiteDeliverySubmission, mediaPaths: [String] = []) throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let payload = try encoder.encode(submission)
        let payloadURL = try container.store.writeMedia(
            payload, filename: "site-delivery-\(submission.clientDeliveryID.uuidString).json")
        let record = SiteRequestOutboxRecord(
            clientDeliveryID: submission.clientDeliveryID,
            requestID: submission.requestID,
            itemID: submission.itemID,
            itemVersionID: submission.itemVersionID,
            payloadPath: payloadURL.path,
            mediaPaths: mediaPaths,
            checksumSHA256: SiteRequestChecksum.sha256(payload))
        try container.store.enqueueSiteRequestDelivery(record)
        if let accessToken {
            Task { await container.siteRequestOutboxDrainer.resume(accessToken: accessToken) }
        }
    }

    private func go(_ destination: CaptureScreenID) {
        coordinator.navigate(to: .site(screen: destination,
                                       projectID: projectID,
                                       requestID: requestID))
    }

    // MARK: - Small visual primitives

    private func title(_ value: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(value).font(CaptureType.title).foregroundStyle(CaptureColor.ink)
            Text(subtitle).font(CaptureType.callout).foregroundStyle(CaptureColor.inkSoft)
        }
    }

    private func sectionLabel(_ value: String) -> some View {
        Text(value).font(CaptureType.eyebrow).foregroundStyle(CaptureColor.verdigrisInk)
    }

    private func card<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content().padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(CaptureColor.paper3)
            .overlay(Rectangle().stroke(CaptureColor.line))
    }

    private func field(_ value: String) -> some View {
        Text(value).font(CaptureType.body).padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .overlay(Rectangle().stroke(CaptureColor.line2))
    }

    private func kitRow(_ kit: SiteRequestKit, detail: String) -> some View {
        card {
            VStack(alignment: .leading, spacing: 5) {
                Text(kit.title).font(CaptureType.bodyEmph)
                Text(detail).font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
            }
        }
    }

    private func requestItemRow(_ item: SiteRequestItem, trailing: String) -> some View {
        card {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(item.title).font(CaptureType.bodyEmph)
                    Text(item.roomName ?? "Room not assigned")
                        .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
                }
                Spacer(); status(trailing)
            }
        }
    }

    private func status(_ value: String) -> some View {
        Text(value.replacingOccurrences(of: "_", with: " ").uppercased())
            .font(CaptureType.eyebrow).foregroundStyle(CaptureColor.verdigrisInk)
    }

    private var mediaGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
            ForEach(SiteRequestFixtures.media) { media in
                ZStack(alignment: .bottomLeading) {
                    CaptureColor.paper2
                    Image(systemName: "photo").font(.title).foregroundStyle(CaptureColor.inkSoft)
                    Text(media.caption ?? "Photo").font(CaptureType.footnote)
                        .padding(8).frame(maxWidth: .infinity, alignment: .leading)
                        .background(CaptureColor.paper.opacity(0.9))
                }.frame(height: 120).overlay(Rectangle().stroke(CaptureColor.line))
            }
        }
    }

    private func reasonChip(_ value: String) -> some View {
        Button(value) { redoNote = value == "Glare" ? SiteRequestFixtures.redoNote : "\(value) — please recapture this exact shot." }
            .font(CaptureType.footnote).buttonStyle(.bordered)
    }

    private var provenance: some View {
        card {
            VStack(alignment: .leading, spacing: 6) {
                Text("PROVENANCE").font(CaptureType.eyebrow)
                Text("Request → item v1 → immutable delivery → approval → Binder entry")
                    .font(CaptureType.callout)
                Text("Source attempts are retained; a newer entry supersedes without overwriting.")
                    .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
            }
        }
    }

    private func historyRow(_ value: String, detail: String, current: Bool) -> some View {
        card {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(value).font(CaptureType.title2)
                    Text(detail).font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
                }
                Spacer(); status(current ? "CURRENT" : "SUPERSEDED")
            }
        }
    }

    private func measureField(_ label: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(CaptureType.eyebrow)
            TextField(metricEntry ? "millimetres" : "inches to 1/16", text: text)
                .keyboardType(.numbersAndPunctuation)
                .font(CaptureType.monoBody).padding(14)
                .overlay(Rectangle().stroke(CaptureColor.line2))
        }
    }

    private func queueRow(_ title: String, state: String, tint: Color) -> some View {
        card {
            HStack {
                Text(title).font(CaptureType.bodyEmph)
                Spacer(); Text(state).font(CaptureType.eyebrow).foregroundStyle(tint)
            }
        }
    }
}

private extension View {
    func sitePrimary() -> some View {
        self.font(CaptureType.bodyEmph)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .foregroundStyle(CaptureColor.paper)
            .background(CaptureColor.verdigris)
    }

    func siteSecondary() -> some View {
        self.font(CaptureType.bodyEmph)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .foregroundStyle(CaptureColor.ink)
            .overlay(Rectangle().stroke(CaptureColor.line2))
    }
}
