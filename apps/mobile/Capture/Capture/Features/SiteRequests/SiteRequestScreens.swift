//  SiteRequestScreens.swift
//  Capture
//
//  Deterministic SR01–SR20 surfaces for the P1 designer/guest loop. Production
//  reads/actions stay behind SiteRequestService; guest upload/delivery state is
//  backed by the SwiftData outbox and an opaque Edge access token.

import SwiftUI
import Observation
import CaptureKit
import CaptureKitMocks

@MainActor
@Observable
private final class SiteRequestDraftSession {
    var requestTitle = ""
    var measureSelected = true
    var photoSelected = true
    var measureRoomID: String?
    var photoRoomID: String?
    var measureTitle = ""
    var measureGuidance = "Measure the requested opening to the nearest 1/16 inch."
    var photoTitle = ""
    var photoGuidance = "Capture wide context, straight on, left return, and close detail."
    var assigneePartyID: String?
    var dueAt = Date().addingTimeInterval(7 * 86_400)
    var dueContext = "before drywall"
    var nudgeNote = ""
    private var seededProjectID: String?

    var selectedCount: Int { (measureSelected ? 1 : 0) + (photoSelected ? 1 : 0) }

    func seedIfNeeded(from hub: SiteProjectHub) {
        guard seededProjectID != hub.projectID, !hub.projectID.isEmpty else { return }
        startNew(from: hub)
    }

    func startNew(from hub: SiteProjectHub) {
        seededProjectID = hub.projectID
        requestTitle = "Site request"
        measureSelected = true
        photoSelected = true
        assigneePartyID = hub.assignees.first?.partyID
        measureRoomID = hub.rooms.first?.id
        photoRoomID = hub.rooms.dropFirst().first?.id ?? hub.rooms.first?.id
        measureTitle = hub.rooms.first.map { "\($0.name) · measure set" } ?? "Measure set"
        measureGuidance = "Measure the requested opening to the nearest 1/16 inch."
        let photoRoom = hub.rooms.first(where: { $0.id == photoRoomID })
        photoTitle = photoRoom.map { "\($0.name) · detail photos" } ?? "Detail photos"
        photoGuidance = "Capture wide context, straight on, left return, and close detail."
        dueAt = Date().addingTimeInterval(7 * 86_400)
        dueContext = "before drywall"
    }

    func selectedItems() -> [SiteRequestDraftItem] {
        SiteRequestDraftBuilder.selectedItems(from: [
            SiteRequestDraftItemChoice(
                kit: .measureSet, isSelected: measureSelected,
                title: measureTitle.trimmingCharacters(in: .whitespacesAndNewlines),
                guidance: measureGuidance.trimmingCharacters(in: .whitespacesAndNewlines),
                roomID: measureRoomID),
            SiteRequestDraftItemChoice(
                kit: .detailPhotos, isSelected: photoSelected,
                title: photoTitle.trimmingCharacters(in: .whitespacesAndNewlines),
                guidance: photoGuidance.trimmingCharacters(in: .whitespacesAndNewlines),
                roomID: photoRoomID)
        ])
    }
}

enum SiteRequestScreens {
    @MainActor
    static func register(into registry: RouteRegistry,
                         container: AppContainer,
                         coordinator: CaptureCoordinator) {
        let draftSession = SiteRequestDraftSession()
        registry.registerRoute(CaptureRoute.site(
            screen: .sr01SiteHub, projectID: nil, requestID: nil).registryKey) { route in
            guard case let .site(screen, projectID, requestID) = route else {
                return AnyView(EmptyView())
            }
            return AnyView(SiteRequestScreen(
                screen: screen,
                projectID: projectID ?? (AppConfiguration.runsRealServices ? "" : SiteRequestFixtures.projectID),
                requestID: requestID ?? (AppConfiguration.runsRealServices ? "" : SiteRequestFixtures.requestID),
                accessToken: coordinator.guestAccessToken,
                draftSession: draftSession,
                container: container,
                coordinator: coordinator))
        }
    }
}

struct GuestSiteRequestRootView: View {
    let accessToken: String
    let container: AppContainer
    let coordinator: CaptureCoordinator
    private let draftSession = SiteRequestDraftSession()

    var body: some View {
        SiteRequestScreen(
            screen: .sr13GuestLanding,
            projectID: "",
            requestID: "",
            accessToken: accessToken,
            draftSession: draftSession,
            container: container,
            coordinator: coordinator)
    }
}

private struct SiteRequestScreen: View {
    let screen: CaptureScreenID
    let projectID: String
    let requestID: String
    let accessToken: String?
    let draftSession: SiteRequestDraftSession
    let container: AppContainer
    let coordinator: CaptureCoordinator

    @State private var hub: SiteProjectHub
    @State private var guest: GuestSiteRequest
    @State private var redoNote = AppConfiguration.runsRealServices ? "" : SiteRequestFixtures.redoNote
    @State private var imperialA: String
    @State private var imperialB: String
    @State private var imperialC: String
    @State private var metricEntry = false
    @State private var additionalMeasurements: [String: String] = [:]
    @State private var measurementProofPaths: [String: String] = [:]
    @State private var photoShotIndex = 0
    @State private var capturedPhotoPaths: [String: String] = [:]
    @State private var skippedPhotoNotes: [String: String] = [:]
    @State private var photoSkipNote = ""
    @State private var actionMessage: String?
    @State private var isWorking = false
    @State private var contractLoaded = false
    @State private var contractFailed = false

    init(screen: CaptureScreenID, projectID: String, requestID: String,
         accessToken: String?, draftSession: SiteRequestDraftSession,
         container: AppContainer, coordinator: CaptureCoordinator) {
        self.screen = screen
        self.projectID = projectID
        self.requestID = requestID
        self.accessToken = accessToken
        self.draftSession = draftSession
        self.container = container
        self.coordinator = coordinator
        if AppConfiguration.runsRealServices {
            let emptyAssignee = SiteRequestAssignee(
                name: "Project contact", normalizedPhone: "", smsConsentGranted: false)
            let emptyRequest = SiteRequestSummary(
                id: "", projectID: projectID, title: "Site request", status: .draft,
                assignee: emptyAssignee, dueAt: Date(),
                deliveredItemCount: 0, itemCount: 0)
            _hub = State(initialValue: SiteProjectHub(
                projectID: projectID, projectName: "", requests: [], reviewItems: [],
                rooms: [], events: []))
            _guest = State(initialValue: GuestSiteRequest(
                request: emptyRequest, designerName: "", studioName: "",
                projectDisplayName: "", items: []))
            _imperialA = State(initialValue: "")
            _imperialB = State(initialValue: "")
            _imperialC = State(initialValue: "")
        } else {
            _hub = State(initialValue: SiteRequestFixtures.hub)
            _guest = State(initialValue: SiteRequestFixtures.guest)
            _imperialA = State(initialValue: "41 3/8")
            _imperialB = State(initialValue: "25 3/4")
            _imperialC = State(initialValue: "96 1/4")
        }
    }

    var body: some View {
        ZStack {
            CaptureColor.paper.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    if AppConfiguration.runsRealServices && !contractLoaded {
                        contractLoadState
                    } else {
                        content
                    }
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
        .task {
            await loadContractData()
            await runForegroundRetryLoop()
        }
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
            HStack {
                Text(isGuest ? "PATINA · SITE REQUEST" : "FIELD · \((contractLoaded || !AppConfiguration.runsRealServices ? hub.projectName : "SITE").uppercased())")
                    .font(CaptureType.eyebrow)
                    .foregroundStyle(CaptureColor.verdigrisInk)
                Spacer()
                if isGuest, accessToken != nil {
                    Button("Leave") { coordinator.leaveGuestRequest() }
                        .font(CaptureType.footnote)
                        .accessibilityIdentifier("siteRequest.leaveGuest")
                }
            }
            Rectangle().fill(CaptureColor.line).frame(height: 1)
        }
    }

    @ViewBuilder private var contractLoadState: some View {
        if contractFailed {
            title("Request unavailable", subtitle: actionMessage ?? "Check your connection and try again.")
        } else {
            HStack(spacing: 12) {
                ProgressView()
                Text("Loading current site request data…").font(CaptureType.callout)
            }
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
            Button("New site request") {
                draftSession.startNew(from: hub)
                go(.sr02Composer)
            }.sitePrimary()
            Button("Open Site Binder") { go(.sr10BinderRooms) }.siteSecondary()
            sectionLabel("ACTIVITY")
            ForEach(hub.events) { event in
                Text("\(event.actorName) \(event.message)")
                    .font(CaptureType.callout)
            }
        }
    }

    private var composer: some View {
        @Bindable var draft = draftSession
        return VStack(alignment: .leading, spacing: 18) {
            title("New site request", subtitle: "\(hub.projectName) · rooms preloaded")
            sectionLabel("REQUEST TITLE")
            TextField("What is needed on site?", text: $draft.requestTitle)
                .textFieldStyle(.plain)
                .font(CaptureType.body)
                .padding(14)
                .overlay(Rectangle().stroke(CaptureColor.line2))
                .accessibilityIdentifier("siteRequest.draftTitle")
            sectionLabel("BUILT-IN KITS")
            Toggle(isOn: $draft.measureSelected) {
                kitLabel(.measureSet, detail: "Three dimensions · optional tape proof")
            }
            .toggleStyle(.switch)
            .accessibilityIdentifier("siteRequest.selectMeasureKit")
            Toggle(isOn: $draft.photoSelected) {
                kitLabel(.detailPhotos, detail: "Four guided angles · reference framing")
            }
            .toggleStyle(.switch)
            .accessibilityIdentifier("siteRequest.selectPhotoKit")
            if draft.selectedCount == 0 {
                Text("Choose at least one built-in kit.")
                    .font(CaptureType.footnote).foregroundStyle(CaptureColor.error)
            }
            sectionLabel("DUE")
            DatePicker("Due date and time", selection: $draft.dueAt,
                       in: Date()..., displayedComponents: [.date, .hourAndMinute])
                .accessibilityIdentifier("siteRequest.dueAt")
            TextField("Context, e.g. before drywall", text: $draft.dueContext)
                .textFieldStyle(.plain)
                .font(CaptureType.body).padding(14)
                .overlay(Rectangle().stroke(CaptureColor.line2))
                .accessibilityIdentifier("siteRequest.dueContext")
            sectionLabel("ASSIGNEE")
            Picker("Project contact", selection: $draft.assigneePartyID) {
                Text("Choose a project contact").tag(String?.none)
                ForEach(hub.assignees.filter { $0.partyID != nil }, id: \.partyID) { assignee in
                    Text("\(assignee.name) · \(assignee.normalizedPhone)")
                        .tag(assignee.partyID)
                }
            }
            .pickerStyle(.menu)
            .accessibilityIdentifier("siteRequest.assignee")
            Button("Configure \(draft.selectedCount) item\(draft.selectedCount == 1 ? "" : "s")") {
                go(.sr03ItemConfig)
            }
            .sitePrimary()
            .disabled(!draftBasicsReady)
        }
    }

    private var itemConfig: some View {
        @Bindable var draft = draftSession
        return VStack(alignment: .leading, spacing: 18) {
            title("Configure items", subtitle: "Definitions freeze at send; later edits create a new version")
            if draft.measureSelected {
                card {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(SiteRequestKit.measureSet.title).font(CaptureType.bodyEmph)
                        Picker("Project room", selection: $draft.measureRoomID) {
                            Text("Choose a room").tag(String?.none)
                            ForEach(hub.rooms) { room in Text(room.name).tag(Optional(room.id)) }
                        }
                        .pickerStyle(.menu)
                        .accessibilityIdentifier("siteRequest.measureRoom")
                        TextField("Item title", text: $draft.measureTitle)
                            .textFieldStyle(.plain).padding(12)
                            .overlay(Rectangle().stroke(CaptureColor.line2))
                            .accessibilityIdentifier("siteRequest.measureTitle")
                        TextField("Capture guidance", text: $draft.measureGuidance, axis: .vertical)
                            .textFieldStyle(.plain).padding(12)
                            .overlay(Rectangle().stroke(CaptureColor.line2))
                            .accessibilityIdentifier("siteRequest.measureGuidance")
                        Text("A floor → sill · B sill → head · C run length")
                            .font(CaptureType.callout).foregroundStyle(CaptureColor.inkSoft)
                    }
                }
            }
            if draft.photoSelected {
                card {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(SiteRequestKit.detailPhotos.title).font(CaptureType.bodyEmph)
                        Picker("Project room", selection: $draft.photoRoomID) {
                            Text("Choose a room").tag(String?.none)
                            ForEach(hub.rooms) { room in Text(room.name).tag(Optional(room.id)) }
                        }
                        .pickerStyle(.menu)
                        .accessibilityIdentifier("siteRequest.photoRoom")
                        TextField("Item title", text: $draft.photoTitle)
                            .textFieldStyle(.plain).padding(12)
                            .overlay(Rectangle().stroke(CaptureColor.line2))
                            .accessibilityIdentifier("siteRequest.photoTitle")
                        TextField("Capture guidance", text: $draft.photoGuidance, axis: .vertical)
                            .textFieldStyle(.plain).padding(12)
                            .overlay(Rectangle().stroke(CaptureColor.line2))
                            .accessibilityIdentifier("siteRequest.photoGuidance")
                        Text("Wide context · straight on · left return · close detail")
                            .font(CaptureType.callout).foregroundStyle(CaptureColor.inkSoft)
                    }
                }
            }
            Text("Custom saved kits and markup arrive after the P1 pilot.")
                .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
            Button("Assign and preview") { go(.sr04AssignSend) }
                .sitePrimary().disabled(!draftItemsReady)
        }
    }

    private var assignAndSend: some View {
        VStack(alignment: .leading, spacing: 18) {
            title(draftSession.requestTitle,
                  subtitle: "\(draftSession.selectedCount) item\(draftSession.selectedCount == 1 ? "" : "s") · due \(draftSession.dueAt.formatted(date: .abbreviated, time: .shortened))")
            card {
                VStack(alignment: .leading, spacing: 6) {
                    let assignee = selectedDraftAssignee
                    Text(assignee?.name ?? "No eligible project party").font(CaptureType.bodyEmph)
                    Text("\(assignee?.normalizedPhone ?? "Missing phone") · \(assignee?.trade ?? "Trade")")
                        .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
                    Label(assignee?.smsConsentGranted == true ? "SMS consent on file" : "Consent required before link dispatch",
                          systemImage: assignee?.smsConsentGranted == true ? "checkmark.circle.fill" : "clock")
                        .font(CaptureType.callout)
                        .foregroundStyle(assignee?.smsConsentGranted == true ? CaptureColor.success : CaptureColor.warning)
                }
            }
            sectionLabel("EXACT SMS PREVIEW")
            card {
                Text("Your designer needs \(draftSession.selectedCount) site item\(draftSession.selectedCount == 1 ? "" : "s") for \(hub.projectName) — due \(draftSession.dueAt.formatted(date: .abbreviated, time: .omitted)). Open your private checklist: client.patina.cloud/field/••••")
                    .font(CaptureType.callout)
            }
            ForEach(Array(draftSession.selectedItems().enumerated()), id: \.offset) { _, item in
                card {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.title).font(CaptureType.bodyEmph)
                        Text("\(item.kit.title) · \(roomName(item.roomID ?? ""))")
                            .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
                        Text(item.guidance).font(CaptureType.callout)
                    }
                }
            }
            Text("Without consent, this request waits in awaiting consent until \(selectedDraftAssignee?.name ?? "the project contact") replies YES.")
                .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
            Button("Send request") { Task { await createAndSendRequest() } }
                .sitePrimary().disabled(isWorking || !draftReadyToSend)
        }
    }

    private var tracker: some View {
        @Bindable var draft = draftSession
        return VStack(alignment: .leading, spacing: 18) {
            let request = activeRequest
            title(request?.title ?? "Site request",
                  subtitle: "\(request?.assignee.name ?? "Project contact") · \(request?.openedAt == nil ? "not opened" : "opened")")
            ProgressView(value: request.map {
                $0.itemCount == 0 ? 0 : Double($0.deliveredItemCount) / Double($0.itemCount)
            } ?? 0).tint(CaptureColor.verdigris)
            Text("\(request?.deliveredItemCount ?? 0) of \(request?.itemCount ?? 0) delivered")
                .font(CaptureType.monoBody)
            ForEach(itemsForActiveRequest) { item in
                requestItemRow(item, trailing: item.status.rawValue)
            }
            sectionLabel("ACTIVITY")
            ForEach(hub.events) { event in
                Text("\(event.actorName) · \(event.message)").font(CaptureType.callout)
            }
            Button("Review delivery") { go(.sr06ReviewInbox) }.sitePrimary()
            if let request {
                if SiteRequestLifecyclePolicy.allows(
                    .nudge, for: request.status,
                    hasSMSConsent: request.assignee.smsConsentGranted) {
                    TextField("Optional nudge note", text: $draft.nudgeNote)
                        .textFieldStyle(.plain).padding(14)
                        .overlay(Rectangle().stroke(CaptureColor.line2))
                        .accessibilityIdentifier("siteRequest.nudgeNote")
                    Button("Nudge") { Task { await nudge(request) } }
                        .siteSecondary().disabled(isWorking)
                }
                if SiteRequestLifecyclePolicy.allows(
                    .resend, for: request.status,
                    hasSMSConsent: request.assignee.smsConsentGranted) {
                    Button("Resend private link") { Task { await resend(request) } }
                        .siteSecondary().disabled(isWorking)
                }
                if SiteRequestLifecyclePolicy.allows(.revokeAccess, for: request.status) {
                    Button("Revoke private link", role: .destructive) {
                        Task { await revokeAccess(request) }
                    }
                    .siteSecondary().disabled(isWorking)
                }
                if SiteRequestLifecyclePolicy.allows(.close, for: request.status) {
                    Button("Close request", role: .destructive) {
                        Task { await close(request) }
                    }
                    .siteSecondary().disabled(isWorking)
                }
            }
        }
    }

    private var reviewInbox: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("Review", subtitle: "2 item deliveries keep their provenance")
            ForEach(deliveredReviewItems) { item in
                requestItemRow(item, trailing: "REVIEW")
            }
            Text("Approvals are item-granular. There is no bulk approve.")
                .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
            Button("Review next delivery") { reviewNextDelivery() }
                .sitePrimary().disabled(deliveredReviewItems.isEmpty)
        }
    }

    private var measureReview: some View {
        VStack(alignment: .leading, spacing: 18) {
            let item = selectedReviewItem(kit: .measureSet)
            title(item?.title ?? "Measure set", subtitle: activeRequest?.assignee.name ?? "Project contact")
            ForEach(selectedReviewItem(kit: .measureSet)?.dimensions ?? []) { dimension in
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
            sectionLabel("SEND BACK — NOTE REQUIRED")
            TextEditor(text: $redoNote)
                .font(CaptureType.body)
                .frame(minHeight: 72)
                .padding(8)
                .overlay(Rectangle().stroke(CaptureColor.line2))
                .accessibilityLabel("Redo instructions for measurements")
                .accessibilityIdentifier("siteRequest.measureRedoNote")
            HStack {
                Button("Approve") { Task { await approveMeasure() } }.sitePrimary()
                Button("Send back") { Task { await sendRedo(kit: .measureSet) } }
                    .siteSecondary()
                    .disabled(redoNote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }

    private var photoReview: some View {
        VStack(alignment: .leading, spacing: 18) {
            let item = selectedReviewItem(kit: .detailPhotos)
            title(item?.title ?? "Detail photos",
                  subtitle: "\(item?.media.count ?? 0) immutable originals · display derivatives")
            mediaGrid(
                item?.media ?? [],
                emptyMessage: "No delivered photos are available for review.")
            sectionLabel("SEND BACK — NOTE REQUIRED")
            HStack { reasonChip("Glare"); reasonChip("Wrong angle"); reasonChip("Closer") }
            TextEditor(text: $redoNote)
                .font(CaptureType.body)
                .frame(minHeight: 96)
                .padding(8)
                .overlay(Rectangle().stroke(CaptureColor.line2))
                .accessibilityLabel("Redo instructions for photos")
                .accessibilityIdentifier("siteRequest.redoNote")
            Text("The pro receives this text verbatim. Only this item reopens.")
                .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
            Button("Send back with note") { Task { await sendRedo(kit: .detailPhotos) } }
                .sitePrimary().disabled(redoNote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            Button("Approve instead") { Task { await approvePhoto() } }.siteSecondary()
        }
    }

    private var approval: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("Filed to the Binder", subtitle: "Exactly one append-only entry created")
            if let entry = approvedBinderEntry {
                card {
                    VStack(alignment: .leading, spacing: 5) {
                        Label(entry.title, systemImage: "checkmark.seal.fill")
                            .font(CaptureType.bodyEmph).foregroundStyle(CaptureColor.success)
                        Text("\(roomName(entry.roomID)) · \(entry.dimensions.count) dimensions · \(entry.media.count) photos")
                            .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
                    }
                }
                provenance(entry)
            } else {
                card { Text("No approved Binder entry is available yet.") }
            }
            Button("View Binder rooms") { go(.sr10BinderRooms) }.sitePrimary()
        }
    }

    private var binderRooms: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("Site Binder", subtitle: "Rooms are the spine; entries append")
            ForEach(hub.rooms) { room in
                Button { go(.sr11BinderDetail, requestID: "room:\(room.id)") } label: {
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
            title(selectedBinderRoom?.name ?? "Binder room",
                  subtitle: "Current approved values with their source")
            ForEach(currentBinderEntriesForRoom) { entry in
                card {
                    VStack(alignment: .leading, spacing: 7) {
                        Text(entry.title).font(CaptureType.bodyEmph)
                        ForEach(entry.dimensions) { dimension in
                            VStack(alignment: .leading, spacing: 3) {
                                Text(dimension.label).font(CaptureType.eyebrow)
                                Text(SiteMeasurement.imperialString(millimetres: dimension.millimetres))
                                    .font(CaptureType.title2)
                                Text("Captured by \(dimension.capturedBy)")
                                    .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
                            }
                        }
                        if !entry.media.isEmpty {
                            Text("\(entry.media.count) approved photos")
                                .font(CaptureType.callout)
                            mediaGrid(entry.media)
                        }
                        Text("Approved by \(entry.approvedBy) · \(entry.approvedAt.formatted(date: .abbreviated, time: .shortened))")
                            .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
                    }
                }
                provenance(entry)
            }
            if currentBinderEntriesForRoom.isEmpty {
                card { Text("No approved entries in this room.") }
            }
            Button("View append-only history") {
                go(.sr12BinderHistory, requestID: "room:\(selectedBinderRoomID ?? "")")
            }.sitePrimary()
        }
    }

    private var binderHistory: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("\(selectedBinderRoom?.name ?? "Binder room") · history",
                  subtitle: "Prior approved entries remain retrievable")
            ForEach(binderHistoryForRoom) { entry in
                card {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(entry.title).font(CaptureType.bodyEmph)
                            Text("\(entry.kind.title) · approved \(entry.approvedAt.formatted(date: .abbreviated, time: .shortened))")
                                .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
                            Text("Source delivery \(entry.sourceDeliverableID)")
                                .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
                            if !entry.media.isEmpty {
                                mediaGrid(entry.media)
                            }
                        }
                        Spacer()
                        status(currentBinderEntryIDs.contains(entry.id) ? "CURRENT" : "SUPERSEDED")
                    }
                }
                provenance(entry)
            }
            if binderHistoryForRoom.isEmpty {
                card { Text("No Binder history is available for this room.") }
            }
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
            let deliveredCount = guest.items.filter { $0.status == .delivered || $0.status == .approved }.count
            Text("\(deliveredCount) of \(guest.items.count) server-received").font(CaptureType.monoBody)
            ProgressView(value: guest.items.isEmpty ? 0 : Double(deliveredCount) / Double(guest.items.count))
                .tint(CaptureColor.verdigris)
            ForEach(guest.items) { item in
                requestItemRow(item, trailing: item.status.rawValue)
            }
            Text("Captured work stays on this phone through dead zones and relaunches. Delivered means the server acknowledged it.")
                .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
            Button("Continue · \(nextGuestItem?.title ?? "No open items")") { continueGuestItem() }
                .sitePrimary().disabled(nextGuestItem == nil)
        }
    }

    private var guestMeasure: some View {
        VStack(alignment: .leading, spacing: 16) {
            title(measureItem?.title ?? "Measure set",
                  subtitle: measureItem?.guidance ?? "Enter the requested measurements.")
            Picker("Units", selection: $metricEntry) {
                Text("Imperial").tag(false); Text("Metric").tag(true)
            }.pickerStyle(.segmented)
            ForEach(Array(measureDefinitions.enumerated()), id: \.element.id) { index, definition in
                VStack(alignment: .leading, spacing: 7) {
                    measureField(definition.label.uppercased(),
                                 text: measurementBinding(index: index, id: definition.id))
                    if let guidance = definition.guidance, !guidance.isEmpty {
                        Text(guidance).font(CaptureType.footnote)
                            .foregroundStyle(CaptureColor.inkSoft)
                    }
                    Button(measurementProofPaths[definition.id] == nil
                           ? "Add optional tape proof" : "Replace tape proof") {
                        Task { await captureMeasurementProof(for: definition) }
                    }
                    .font(CaptureType.footnote)
                    if measurementProofPaths[definition.id] != nil {
                        Label("Proof saved on this phone", systemImage: "checkmark.circle.fill")
                            .font(CaptureType.footnote).foregroundStyle(CaptureColor.success)
                    }
                }
            }
            Text("Imperial entry snaps to 1/16 in. Storage is canonical integer millimetres.")
                .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
            Button("Queue measurement delivery") { Task { await queueMeasurement() } }
                .sitePrimary().disabled(isWorking)
        }
    }

    private var guestPhoto: some View {
        VStack(alignment: .leading, spacing: 16) {
            title(photoItem?.title ?? "Detail photos",
                  subtitle: photoItem?.guidance ?? "Capture the requested views.")
            if let shot = currentPhotoShot {
                Text("SHOT \(photoShotIndex + 1) OF \(photoShots.count)")
                    .font(CaptureType.eyebrow).foregroundStyle(CaptureColor.verdigrisInk)
                Text(shot.label).font(CaptureType.title2)
                if let guidance = shot.guidance, !guidance.isEmpty {
                    Text(guidance).font(CaptureType.callout)
                }
                ZStack {
                    CaptureColor.ink2
                    RoundedRectangle(cornerRadius: 80)
                        .stroke(CaptureColor.paper.opacity(0.7), lineWidth: 2)
                        .frame(width: 180, height: 210)
                    VStack {
                        Text(shot.referenceURL == nil ? "GUIDED FRAME" : "REFERENCE FRAME")
                            .font(CaptureType.eyebrow).foregroundStyle(CaptureColor.paper)
                        Spacer()
                        Image(systemName: "camera.circle.fill").font(.system(size: 58))
                            .foregroundStyle(CaptureColor.paper)
                    }.padding(24)
                }
                .frame(height: 300)
                Text("Low light — steady the phone or turn on the work lamp.")
                    .font(CaptureType.callout).foregroundStyle(CaptureColor.warning)
                Button("Capture \(shot.label)") { Task { await captureCurrentPhoto() } }
                    .sitePrimary().disabled(isWorking)
                TextField("Required reason to skip this shot", text: $photoSkipNote)
                    .font(CaptureType.body).padding(14)
                    .overlay(Rectangle().stroke(CaptureColor.line2))
                Button("Skip this shot") { skipCurrentPhoto() }
                    .siteSecondary()
                    .disabled(photoSkipNote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            } else {
                card {
                    VStack(alignment: .leading, spacing: 7) {
                        Text("All configured shots accounted for").font(CaptureType.bodyEmph)
                        Text("\(capturedPhotoPaths.count) captured · \(skippedPhotoNotes.count) skipped with notes")
                            .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
                    }
                }
                Button("Queue photo delivery") { Task { await queuePhoto() } }
                    .sitePrimary().disabled(isWorking || !photoShotsComplete)
            }
        }
    }

    private var guestQueue: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("Delivery queue", subtitle: "Durable across relaunch")
            ForEach(guestOutboxRecords) { record in
                queueRow(guest.items.first(where: { $0.id == record.itemID })?.title ?? "Site request item",
                         state: record.state.rawValue.uppercased(),
                         detail: record.terminalReason?.userMessage
                            ?? (record.state == .failed ? "Waiting to retry automatically." : nil),
                         tint: record.state == .failed || record.state == .terminal
                            ? CaptureColor.error : CaptureColor.verdigrisInk)
            }
            if guestOutboxRecords.isEmpty {
                card { Text("No deliveries are queued on this phone.") }
            }
            Text("Retries keep the same client delivery ID and checksum. Duplicate taps cannot create duplicate deliveries.")
                .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
            if matchingDeliveredGuestRecord != nil {
                Button("View server receipt") { go(.sr18GuestReceipt) }.sitePrimary()
            } else {
                Button("Check receipt status") { go(.sr18GuestReceipt) }.siteSecondary()
            }
        }
    }

    private var guestReceipt: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let receipt = matchingDeliveredGuestRecord {
                title("Received by Patina", subtitle: "Server receipt recorded")
                card {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Server receipt recorded", systemImage: "checkmark.circle.fill")
                        if !receipt.mediaPaths.isEmpty {
                            Label("\(receipt.mediaPaths.count) media checksums verified", systemImage: "checkmark.circle.fill")
                        }
                        Label("Server delivery \(receipt.serverDeliverableID!)", systemImage: "checkmark.circle.fill")
                        Label("Delivery linked to item version \(receipt.itemVersionID)", systemImage: "link")
                    }
                    .font(CaptureType.callout).foregroundStyle(CaptureColor.success)
                }
                Button("Back to checklist") { go(.sr19GuestDone) }.sitePrimary()
            } else if let terminal = guestOutboxRecords.last(where: { $0.state == .terminal }) {
                title("Delivery needs attention", subtitle: "No server receipt was recorded")
                card {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Not delivered", systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(CaptureColor.error)
                        Text(terminal.terminalReason?.userMessage
                             ?? "This saved delivery cannot be retried.")
                            .font(CaptureType.callout)
                    }
                }
                Button("Return to delivery queue") { go(.sr17GuestQueue) }.sitePrimary()
            } else {
                title("Receipt pending", subtitle: "Patina has not acknowledged this delivery yet")
                card {
                    Text("Your capture remains saved on this phone. Keep this private link and return when you have a connection.")
                        .font(CaptureType.callout)
                }
                Button("Return to delivery queue") { go(.sr17GuestQueue) }.sitePrimary()
            }
        }
    }

    private var guestDone: some View {
        Group {
            if matchingDeliveredGuestRecord != nil {
                VStack(alignment: .center, spacing: 18) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 72)).foregroundStyle(CaptureColor.success)
                    Text("Delivery received")
                        .font(CaptureType.title)
                    Text("Patina recorded a matching server receipt. This link stays available for a returned item until the request closes.")
                        .font(CaptureType.callout).foregroundStyle(CaptureColor.inkSoft)
                        .multilineTextAlignment(.center)
                    Button("Back to checklist") { go(.sr14GuestChecklist) }.sitePrimary()
                    if guest.items.contains(where: { $0.status == .redo }) {
                        Button("View returned item") { go(.sr20GuestReturned) }.siteSecondary()
                    }
                }
            } else {
                VStack(alignment: .center, spacing: 18) {
                    Image(systemName: "clock.badge.exclamationmark")
                        .font(.system(size: 64)).foregroundStyle(CaptureColor.warning)
                    Text("Receipt not available").font(CaptureType.title)
                    Text("This phone does not have a matching server receipt yet, so the delivery is not marked complete.")
                        .font(CaptureType.callout).foregroundStyle(CaptureColor.inkSoft)
                        .multilineTextAlignment(.center)
                    Button("Return to delivery queue") { go(.sr17GuestQueue) }.sitePrimary()
                }
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var guestReturned: some View {
        VStack(alignment: .leading, spacing: 18) {
            title("1 item returned", subtitle: "Everything else stands")
            if let returned = guest.items.first(where: { $0.status == .redo }) {
                requestItemRow(returned, trailing: "RETURNED")
            }
            card {
                Text(guest.items.first(where: { $0.status == .redo })?.redoNote ?? "Please recapture this item.")
                    .font(CaptureType.bodyEmph)
                    .accessibilityIdentifier("siteRequest.verbatimRedoNote")
            }
            Text("The previous attempt remains in history. This exact item alone is open again.")
                .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
            Button("Recapture this item") { continueGuestItem(preferReturned: true) }.sitePrimary()
        }
    }

    // MARK: - Contract actions

    private var activeProjectID: String {
        if isGuest, accessToken != nil { return guest.request.projectID }
        return projectID.isEmpty ? hub.projectID : projectID
    }

    private var activeRequestID: String {
        if isGuest, accessToken != nil { return guest.request.id }
        if !requestID.isEmpty, !requestID.hasPrefix("room:") { return requestID }
        return hub.requests.first?.id ?? ""
    }

    private var activeRequest: SiteRequestSummary? {
        hub.requests.first(where: { $0.id == activeRequestID }) ?? hub.requests.first
    }

    private var selectedDraftAssignee: SiteRequestAssignee? {
        hub.assignees.first { $0.partyID == draftSession.assigneePartyID }
    }

    private var draftBasicsReady: Bool {
        !draftSession.requestTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && draftSession.selectedCount > 0
            && selectedDraftAssignee != nil
            && draftSession.dueAt > Date()
    }

    private var draftItemsReady: Bool {
        draftBasicsReady && !draftSession.selectedItems().isEmpty
            && draftSession.selectedItems().allSatisfy {
                $0.roomID != nil
                    && !$0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    && !$0.guidance.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            }
    }

    private var draftReadyToSend: Bool {
        draftItemsReady && selectedDraftAssignee?.partyID != nil
    }

    private var itemsForActiveRequest: [SiteRequestItem] {
        hub.reviewItems.filter { $0.requestID == nil || $0.requestID == activeRequestID }
    }

    private var deliveredReviewItems: [SiteRequestItem] {
        itemsForActiveRequest.filter { $0.status == .delivered }
    }

    private var nextGuestItem: SiteRequestItem? {
        guest.items.first(where: { $0.status == .pending || $0.status == .redo })
    }

    private var approvedBinderEntry: SiteBinderEntry? {
        hub.currentBinderEntries.first(where: { $0.requestID == activeRequestID })
            ?? (AppConfiguration.runsRealServices ? nil : hub.currentBinderEntries.first)
    }

    private var selectedBinderRoomID: String? {
        if requestID.hasPrefix("room:") {
            let value = String(requestID.dropFirst("room:".count))
            if !value.isEmpty { return value }
        }
        return approvedBinderEntry?.roomID ?? hub.currentBinderEntries.first?.roomID
            ?? hub.rooms.first?.id
    }

    private var selectedBinderRoom: SiteBinderRoom? {
        hub.rooms.first(where: { $0.id == selectedBinderRoomID })
    }

    private var currentBinderEntriesForRoom: [SiteBinderEntry] {
        hub.currentBinderEntries.filter { $0.roomID == selectedBinderRoomID }
            .sorted { $0.approvedAt > $1.approvedAt }
    }

    private var binderHistoryForRoom: [SiteBinderEntry] {
        hub.binderEntries.filter { $0.roomID == selectedBinderRoomID }
            .sorted { $0.approvedAt > $1.approvedAt }
    }

    private var currentBinderEntryIDs: Set<String> {
        Set(hub.currentBinderEntries.map(\.id))
    }

    private var measureItem: SiteRequestItem? {
        guest.items.first(where: { $0.kit == .measureSet })
    }

    private var measureDefinitions: [SiteRequestMeasureDefinition] {
        guard let configured = measureItem?.measureDefinitions, !configured.isEmpty else {
            return SiteRequestMeasureDefinition.p1MeasureSet
        }
        return configured
    }

    private var photoItem: SiteRequestItem? {
        guest.items.first(where: { $0.kit == .detailPhotos })
    }

    private var photoShots: [SiteRequestPhotoShot] {
        guard let configured = photoItem?.photoShots, !configured.isEmpty else {
            return SiteRequestPhotoShot.p1DetailPhotos
        }
        return configured
    }

    private var currentPhotoShot: SiteRequestPhotoShot? {
        guard photoShots.indices.contains(photoShotIndex) else { return nil }
        return photoShots[photoShotIndex]
    }

    private var photoShotsComplete: Bool {
        photoShots.allSatisfy {
            capturedPhotoPaths[$0.id] != nil || skippedPhotoNotes[$0.id] != nil
        }
    }

    private var photoResults: [SiteRequestPhotoResult] {
        photoShots.compactMap { shot in
            if capturedPhotoPaths[shot.id] != nil {
                return SiteRequestPhotoResult(
                    id: shot.id, label: shot.label, status: .captured)
            }
            if let note = skippedPhotoNotes[shot.id] {
                return SiteRequestPhotoResult(
                    id: shot.id, label: shot.label, status: .skipped,
                    skipNote: note)
            }
            return nil
        }
    }

    private var guestOutboxRecords: [SiteRequestOutboxRecord] {
        container.store.siteRequestOutbox()
            .filter { $0.requestID == guest.request.id }
            .sorted { $0.createdAt < $1.createdAt }
    }

    private var matchingDeliveredGuestRecord: SiteRequestOutboxRecord? {
        guestOutboxRecords.last(where: { record in
            SiteRequestReceiptEvidence.matches(
                record, requestID: guest.request.id, items: guest.items)
        })
    }

    private func selectedReviewItem(kit: SiteRequestKit) -> SiteRequestItem? {
        if let delivered = deliveredReviewItems.first(where: { $0.kit == kit }) {
            return delivered
        }
        return AppConfiguration.runsRealServices
            ? nil
            : itemsForActiveRequest.first(where: { $0.kit == kit })
    }

    private func reviewNextDelivery() {
        guard let item = deliveredReviewItems.first else { return }
        go(item.kit == .measureSet ? .sr07MeasureReview : .sr08PhotoReview)
    }

    private func continueGuestItem(preferReturned: Bool = false) {
        let item = preferReturned
            ? guest.items.first(where: { $0.status == .redo })
            : nextGuestItem
        guard let item else { return }
        go(item.kit == .measureSet ? .sr15GuestMeasure : .sr16GuestPhoto)
    }

    private func guestSubmission(
        kit: SiteRequestKit,
        clientDeliveryID: UUID,
        dimensions: [SiteRequestDimension] = [],
        skippedShotLabels: [String] = [],
        photoResults: [SiteRequestPhotoResult]? = nil
    ) throws -> SiteDeliverySubmission {
        if accessToken != nil {
            guard let submission = guest.deliverySubmission(
                for: kit, clientDeliveryID: clientDeliveryID,
                dimensions: dimensions,
                skippedShotLabels: skippedShotLabels,
                photoResults: photoResults) else {
                throw SiteRequestRemoteError.noOpenItem
            }
            return submission
        }
        guard !AppConfiguration.runsRealServices else {
            throw SiteRequestRemoteError.noOpenItem
        }
        let fixture = kit == .measureSet
            ? (SiteRequestFixtures.measureItemID, SiteRequestFixtures.measureVersionID)
            : (SiteRequestFixtures.photoItemID, SiteRequestFixtures.photoVersionID)
        return SiteDeliverySubmission(
            requestID: SiteRequestFixtures.requestID, itemID: fixture.0,
            itemVersionID: fixture.1, clientDeliveryID: clientDeliveryID,
            dimensions: dimensions, skippedShotLabels: skippedShotLabels,
            photoResults: photoResults)
    }

    private func createAndSendRequest() async {
        isWorking = true
        defer { isWorking = false }
        do {
            guard draftReadyToSend,
                  let assignee = selectedDraftAssignee else {
                throw SiteRequestRemoteError.assigneePartyRequired
            }
            let dueContext = draftSession.dueContext.trimmingCharacters(
                in: .whitespacesAndNewlines)
            let draft = SiteRequestDraft(
                projectID: hub.projectID,
                title: draftSession.requestTitle.trimmingCharacters(in: .whitespacesAndNewlines),
                assignee: assignee, dueAt: draftSession.dueAt,
                dueContext: dueContext.isEmpty ? nil : dueContext,
                items: draftSession.selectedItems())
            let newRequestID = try await container.siteRequests.createDraft(draft)
            try await container.siteRequests.send(
                requestID: newRequestID,
                expiresAt: draftSession.dueAt.addingTimeInterval(30 * 86_400))
            actionMessage = assignee.smsConsentGranted
                ? "Request accepted for dispatch"
                : "Request created · awaiting SMS consent"
            go(.sr05Tracker, requestID: newRequestID)
        } catch { actionMessage = error.localizedDescription }
    }

    private func loadContractData() async {
        container.analytics.screen(screen.rawValue)
        do {
            if isGuest, let accessToken {
                guest = try await container.guestSiteRequests.bootstrap(accessToken: accessToken)
                coordinator.bindGuestRequest(requestID: guest.request.id)
                contractLoaded = true
                await resumeGuestOutbox()
            } else if !isGuest {
                hub = try await container.siteRequests.hub(projectID: projectID)
                draftSession.seedIfNeeded(from: hub)
                contractLoaded = true
            } else {
                contractLoaded = true
            }
        } catch {
            if let remote = error as? SiteRequestRemoteError,
               remote.invalidatesGuestAccess {
                coordinator.leaveGuestRequest()
            }
            contractFailed = true
            actionMessage = AppConfiguration.runsRealServices
                ? error.localizedDescription
                : "Offline fixture shown · \(error.localizedDescription)"
        }
    }

    private func runForegroundRetryLoop() async {
        guard isGuest, accessToken != nil, contractLoaded else { return }
        while !Task.isCancelled {
            do { try await Task.sleep(for: .seconds(5)) } catch { return }
            await resumeGuestOutbox()
        }
    }

    private func resumeGuestOutbox() async {
        await container.siteRequestOutboxDrainer.resume { requestID in
            coordinator.guestAccessToken(for: requestID)
        }
    }

    private func approveMeasure() async {
        do {
            guard let item = selectedReviewItem(kit: .measureSet),
                  let deliverableID = item.deliverableID else {
                throw SiteRequestRemoteError.reviewDeliveryRequired
            }
            try await container.siteRequests.approve(
                itemID: item.id, deliverableID: deliverableID,
                roomID: item.roomID ?? hub.rooms.first?.id)
            go(.sr09Approval)
        } catch { actionMessage = error.localizedDescription }
    }

    private func approvePhoto() async {
        do {
            guard let item = selectedReviewItem(kit: .detailPhotos),
                  let deliverableID = item.deliverableID else {
                throw SiteRequestRemoteError.reviewDeliveryRequired
            }
            try await container.siteRequests.approve(
                itemID: item.id, deliverableID: deliverableID,
                roomID: item.roomID ?? hub.rooms.first?.id)
            go(.sr09Approval)
        } catch { actionMessage = error.localizedDescription }
    }

    private func sendRedo(kit: SiteRequestKit) async {
        do {
            guard let item = selectedReviewItem(kit: kit) else {
                throw SiteRequestRemoteError.reviewDeliveryRequired
            }
            try await container.siteRequests.redo(itemID: item.id, note: redoNote)
            actionMessage = "Returned verbatim · only \(item.title) reopened"
        } catch { actionMessage = error.localizedDescription }
    }

    private func resend(_ request: SiteRequestSummary) async {
        await performDesignerAction(success: "Private link accepted for resend") {
            try await container.siteRequests.resend(
                requestID: request.id,
                expiresAt: max(request.dueAt.addingTimeInterval(7 * 86_400),
                               Date().addingTimeInterval(7 * 86_400)))
        }
    }

    private func nudge(_ request: SiteRequestSummary) async {
        let note = draftSession.nudgeNote.trimmingCharacters(in: .whitespacesAndNewlines)
        await performDesignerAction(success: "Nudge accepted for dispatch") {
            try await container.siteRequests.nudge(
                requestID: request.id, note: note.isEmpty ? nil : note)
        }
    }

    private func revokeAccess(_ request: SiteRequestSummary) async {
        await performDesignerAction(success: "Private access revoked") {
            try await container.siteRequests.revokeAccess(
                requestID: request.id, reason: "Revoked from Patina Field")
        }
    }

    private func close(_ request: SiteRequestSummary) async {
        await performDesignerAction(success: "Request closed and private access revoked") {
            try await container.siteRequests.close(requestID: request.id)
        }
    }

    private func performDesignerAction(success: String,
                                       operation: () async throws -> Void) async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await operation()
            actionMessage = success
            if let refreshed = try? await container.siteRequests.hub(projectID: activeProjectID) {
                hub = refreshed
            }
        } catch {
            actionMessage = error.localizedDescription
        }
    }

    private func queueMeasurement() async {
        isWorking = true
        defer { isWorking = false }
        do {
            let parser = metricEntry ? SiteMeasurement.millimetres(fromMetric:) : SiteMeasurement.millimetres(fromImperial:)
            let dimensions = try measureDefinitions.enumerated().map { index, definition in
                SiteRequestDimension(
                    id: "local-dim-\(definition.id)", label: definition.label,
                    millimetres: try parser(measurementValue(index: index, id: definition.id)),
                    capturedBy: guest.request.assignee.name, capturedAt: Date(),
                    proofAssetPath: measurementProofPaths[definition.id])
            }
            try enqueue(submission: try guestSubmission(
                kit: .measureSet, clientDeliveryID: UUID(), dimensions: dimensions),
                mediaPaths: measureDefinitions.compactMap { measurementProofPaths[$0.id] })
            go(.sr17GuestQueue)
        } catch { actionMessage = error.localizedDescription }
    }

    private func queuePhoto() async {
        isWorking = true
        defer { isWorking = false }
        do {
            guard photoShotsComplete else { throw SiteRequestRemoteError.invalidResponse }
            let skipped = photoResults.filter { $0.status == .skipped }.map(\.label)
            try enqueue(submission: try guestSubmission(
                kit: .detailPhotos, clientDeliveryID: UUID(),
                skippedShotLabels: skipped, photoResults: photoResults),
                mediaPaths: photoShots.compactMap { capturedPhotoPaths[$0.id] })
            go(.sr17GuestQueue)
        } catch { actionMessage = error.localizedDescription }
    }

    private func captureCurrentPhoto() async {
        guard let shot = currentPhotoShot else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            try await container.camera.configure(mode: .photo)
            await container.camera.start()
            defer { container.camera.stop() }
            let frame = try await container.camera.capture()
            let mediaURL = try container.store.writeMedia(
                frame.data,
                filename: "site-request-\(UUID().uuidString).heic")
            capturedPhotoPaths[shot.id] = mediaURL.path
            skippedPhotoNotes.removeValue(forKey: shot.id)
            photoSkipNote = ""
            photoShotIndex += 1
        } catch { actionMessage = error.localizedDescription }
    }

    private func skipCurrentPhoto() {
        guard let shot = currentPhotoShot else { return }
        let note = photoSkipNote.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !note.isEmpty else { return }
        skippedPhotoNotes[shot.id] = note
        capturedPhotoPaths.removeValue(forKey: shot.id)
        photoSkipNote = ""
        photoShotIndex += 1
    }

    private func captureMeasurementProof(for definition: SiteRequestMeasureDefinition) async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await container.camera.configure(mode: .photo)
            await container.camera.start()
            defer { container.camera.stop() }
            let frame = try await container.camera.capture()
            let mediaURL = try container.store.writeMedia(
                frame.data,
                filename: "site-proof-\(UUID().uuidString).heic")
            measurementProofPaths[definition.id] = mediaURL.path
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
        if accessToken != nil { Task { await resumeGuestOutbox() } }
    }

    private func go(_ destination: CaptureScreenID, requestID overrideRequestID: String? = nil) {
        coordinator.navigate(to: .site(screen: destination,
                                       projectID: activeProjectID,
                                       requestID: overrideRequestID ?? activeRequestID))
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

    private func kitLabel(_ kit: SiteRequestKit, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(kit.title).font(CaptureType.bodyEmph)
            Text(detail).font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
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

    @ViewBuilder private func mediaGrid(
        _ media: [SiteRequestMedia], emptyMessage: String? = nil
    ) -> some View {
        if media.isEmpty {
            if let emptyMessage {
                card {
                    Text(emptyMessage)
                        .font(CaptureType.callout)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
            }
        } else {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(media) { mediaItem in
                    mediaTile(mediaItem)
                }
            }
        }
    }

    private func mediaTile(_ media: SiteRequestMedia) -> some View {
        let label = media.caption ?? "Delivered photo"
        return ZStack(alignment: .bottomLeading) {
            CaptureColor.paper2
            if let url = media.signedDisplayURL {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:
                        mediaState(
                            systemImage: "arrow.down.circle",
                            title: "Loading preview")
                            .accessibilityLabel("Loading \(label)")
                    case let .success(image):
                        image.resizable().scaledToFill()
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .clipped()
                            .accessibilityLabel(label)
                    case .failure:
                        mediaState(
                            systemImage: "exclamationmark.triangle",
                            title: "Preview unavailable")
                            .accessibilityLabel("\(label), preview unavailable")
                    @unknown default:
                        mediaState(
                            systemImage: "exclamationmark.triangle",
                            title: "Preview unavailable")
                            .accessibilityLabel("\(label), preview unavailable")
                    }
                }
            } else {
                mediaState(
                    systemImage: "exclamationmark.triangle",
                    title: "Preview unavailable")
                    .accessibilityLabel("\(label), preview unavailable")
            }
            Text(label).font(CaptureType.footnote)
                .lineLimit(2)
                .padding(8).frame(maxWidth: .infinity, alignment: .leading)
                .background(CaptureColor.paper.opacity(0.9))
        }
        .frame(height: 150)
        .overlay(Rectangle().stroke(CaptureColor.line))
    }

    private func mediaState(systemImage: String, title: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: systemImage)
                .font(.title2)
            Text(title).font(CaptureType.footnote)
        }
        .foregroundStyle(CaptureColor.inkSoft)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func reasonChip(_ value: String) -> some View {
        Button(value) { redoNote = value == "Glare" ? "Re-shoot in daylight — glare hides the grout line." : "\(value) — please recapture this exact shot." }
            .font(CaptureType.footnote).buttonStyle(.bordered)
    }

    private func provenance(_ entry: SiteBinderEntry) -> some View {
        card {
            VStack(alignment: .leading, spacing: 6) {
                Text("PROVENANCE").font(CaptureType.eyebrow)
                Text("Request \(entry.requestID ?? "unknown") → item version \(entry.itemVersionID ?? "unknown")")
                    .font(CaptureType.callout)
                Text("Immutable delivery \(entry.sourceDeliverableID) → approved by \(entry.approvedBy)")
                    .font(CaptureType.callout)
                Text(entry.supersedesEntryID.map { "Supersedes Binder entry \($0); prior history remains retrievable." }
                     ?? "This append-only Binder entry does not overwrite its source delivery.")
                    .font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
            }
        }
    }

    private func roomName(_ id: String) -> String {
        hub.rooms.first(where: { $0.id == id })?.name ?? "Project room"
    }

    private func measurementValue(index: Int, id: String) -> String {
        switch index {
        case 0: return imperialA
        case 1: return imperialB
        case 2: return imperialC
        default: return additionalMeasurements[id] ?? ""
        }
    }

    private func measurementBinding(index: Int, id: String) -> Binding<String> {
        Binding(
            get: { measurementValue(index: index, id: id) },
            set: { value in
                switch index {
                case 0: imperialA = value
                case 1: imperialB = value
                case 2: imperialC = value
                default: additionalMeasurements[id] = value
                }
            })
    }

    private func measureField(_ label: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(CaptureType.eyebrow)
            TextField(metricEntry ? "millimetres" : "inches to 1/16", text: text)
                .keyboardType(.numbersAndPunctuation)
                .font(CaptureType.monoBody).padding(14)
                .overlay(Rectangle().stroke(CaptureColor.line2))
                .accessibilityLabel(label)
        }
    }

    private func queueRow(_ title: String, state: String, detail: String? = nil,
                          tint: Color) -> some View {
        card {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(title).font(CaptureType.bodyEmph)
                    Spacer(); Text(state).font(CaptureType.eyebrow).foregroundStyle(tint)
                }
                if let detail {
                    Text(detail).font(CaptureType.footnote).foregroundStyle(tint)
                }
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
