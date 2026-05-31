//
//  MessagingRealtimeService.swift
//  Patina
//
//  Subscribes to Supabase Realtime postgres-changes on
//  `public.comms_messages` filtered by `thread_id`. Yields freshly-decoded
//  `RemoteCommsMessage` rows into an AsyncStream that the ViewModel
//  consumes. RLS gates which rows the user actually receives, so we don't
//  need a participant check on the client.
//
//  Lifecycle: one instance per open ThreadDetailView. Call
//  `subscribe(threadId:)` on appear and `stop()` on disappear. Re-using
//  the same instance for a new thread is allowed — `subscribe` tears down
//  any prior channel first.
//

import Foundation
import Supabase

/// Yields `RemoteCommsMessage` values when new rows are INSERTed into
/// `public.comms_messages` for a given thread.
public final class MessagingRealtimeService: @unchecked Sendable {
    private let client: SupabaseClient
    private let decoder: JSONDecoder

    /// Active channel, if subscribed. Guarded by `lock`.
    private var channel: RealtimeChannelV2?
    /// Background task draining the postgres-change AsyncStream. Cancelled
    /// in `stop()` so the stream's `onTermination` runs and the inner
    /// subscription is released.
    private var listenerTask: Task<Void, Never>?
    private let lock = NSLock()

    public init(
        client: SupabaseClient = SupabaseClientManager.shared.client,
        decoder: JSONDecoder = JSONDecoder()
    ) {
        self.client = client
        self.decoder = decoder
    }

    deinit {
        // Best-effort cleanup if the owner forgot to call stop(). We can't
        // await unsubscribe() from deinit, but cancelling the listener
        // task lets the AsyncStream tear down its inner subscription.
        listenerTask?.cancel()
    }

    /// Open a postgres-changes subscription for INSERTs on
    /// `comms_messages` where `thread_id = threadId`. Decoded messages
    /// are delivered on the returned AsyncStream until `stop()` is called
    /// (or this service is deinit'd).
    ///
    /// If a previous subscription is still active, it is torn down before
    /// the new one is opened.
    public func subscribe(threadId: String) -> AsyncStream<RemoteCommsMessage> {
        // Tear down any prior subscription. We don't await here because
        // callers may resubscribe synchronously; the listener Task will
        // unwind asynchronously.
        let prior = lock.withLock { () -> (RealtimeChannelV2?, Task<Void, Never>?) in
            let oldChannel = channel
            let oldTask = listenerTask
            channel = nil
            listenerTask = nil
            return (oldChannel, oldTask)
        }
        prior.1?.cancel()
        if let oldChannel = prior.0 {
            Task { await oldChannel.unsubscribe() }
        }

        let (stream, continuation) = AsyncStream<RemoteCommsMessage>.makeStream()

        let topic = "comms_messages:thread=\(threadId)"
        let newChannel = client.realtimeV2.channel(topic)

        // Capture the inner postgres-changes stream before subscribe(),
        // matching the supabase-swift docs' recommended ordering.
        let changes = newChannel.postgresChange(
            InsertAction.self,
            schema: "public",
            table: "comms_messages",
            filter: .eq("thread_id", value: threadId)
        )

        let decoder = self.decoder
        let task = Task { [weak self] in
            await newChannel.subscribe()
            for await action in changes {
                if Task.isCancelled { break }
                do {
                    let message = try action.decodeRecord(
                        as: RemoteCommsMessage.self,
                        decoder: decoder
                    )
                    continuation.yield(message)
                } catch {
                    #if DEBUG
                    PatinaLog.ui.error("[MessagingRealtime] decode failed: \(error.localizedDescription)")
                    #endif
                }
            }
            continuation.finish()
            _ = self // keep self alive while loop runs
        }

        continuation.onTermination = { [weak self] _ in
            // If the consumer finishes the stream (e.g. cancels the
            // iteration), drop the subscription too.
            guard let self else { return }
            Task { await self.stop() }
        }

        lock.withLock {
            self.channel = newChannel
            self.listenerTask = task
        }

        return stream
    }

    /// Tear down the active channel and cancel the listener task. Safe to
    /// call multiple times.
    public func stop() async {
        let (oldChannel, oldTask) = lock.withLock { () -> (RealtimeChannelV2?, Task<Void, Never>?) in
            let c = channel
            let t = listenerTask
            channel = nil
            listenerTask = nil
            return (c, t)
        }
        oldTask?.cancel()
        if let oldChannel {
            await oldChannel.unsubscribe()
        }
    }
}
