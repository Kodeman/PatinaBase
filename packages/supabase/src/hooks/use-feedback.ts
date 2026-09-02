import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR.
const getSupabase = () => createBrowserClient();

const SCREENSHOT_BUCKET = 'feedback-screenshots';
const SIGNED_URL_TTL_SECONDS = 60 * 10; // 10 minutes — a detail-view read.

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type FeedbackBucket = 'working' | 'not_working' | 'missing' | 'change';
export type FeedbackWeight = 'low' | 'med' | 'high';
export type FeedbackStatus = 'noted' | 'building' | 'shipped' | 'archived';
/** A plain note, or a bug that files a GitHub issue on insert (00557). */
export type FeedbackReportKind = 'note' | 'bug';

export interface Feedback {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  bucket: FeedbackBucket;
  note: string | null;
  weight: FeedbackWeight | null;
  screen_name: string | null;
  route: string | null;
  app_version: string | null;
  viewport: string | null;
  element: string | null;
  screenshot_path: string | null;
  status: FeedbackStatus;
  resolution: string | null;
  shipped_seen_at: string | null;
  report_kind: FeedbackReportKind;
  user_agent: string | null;
  github_issue_number: number | null;
  github_issue_url: string | null;
  github_issue_error: string | null;
}

export type FeedbackEventKind = 'status_change' | 'reply' | 'reaction';

export interface FeedbackEvent {
  id: string;
  feedback_id: string;
  created_at: string;
  actor: string | null;
  kind: FeedbackEventKind;
  // status_change: { from, to, note } · reply: { text } · reaction: { emoji }
  payload: Record<string, unknown>;
}

export interface FeedbackFilters {
  bucket?: FeedbackBucket;
  status?: FeedbackStatus;
  /** 'date' (newest first, default) or 'weight' (high → low, then newest). */
  sort?: 'date' | 'weight';
}

export interface CreateFeedbackInput {
  bucket: FeedbackBucket;
  note?: string | null;
  weight?: FeedbackWeight | null;
  screen_name?: string | null;
  route?: string | null;
  app_version?: string | null;
  viewport?: string | null;
  element?: string | null;
  /** The pre-captured screen (R7.2.4). Uploaded before the row is written. */
  screenshot?: Blob | null;
  /** 'bug' fires the GitHub-issue trigger (00557). Defaults to 'note'. */
  report_kind?: FeedbackReportKind;
  user_agent?: string | null;
}

const WEIGHT_RANK: Record<FeedbackWeight, number> = { high: 3, med: 2, low: 1 };

// ═══════════════════════════════════════════════════════════════════════════
// READ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The Ledger list (R7.4). RLS scopes the rows: an author sees her own notes, a
 * super_admin sees all. Newest-first by default; 'weight' sort ranks high→low
 * then falls back to recency.
 */
export function useFeedback(
  filters?: FeedbackFilters,
  options?: { refetchInterval?: number | false },
) {
  return useQuery({
    queryKey: ['feedback', filters ?? {}],
    refetchInterval: options?.refetchInterval,
    queryFn: async (): Promise<Feedback[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      let query = supabase
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.bucket) query = query.eq('bucket', filters.bucket);
      if (filters?.status) query = query.eq('status', filters.status);

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as Feedback[];
      if (filters?.sort === 'weight') {
        return [...rows].sort((a, b) => {
          const wa = a.weight ? WEIGHT_RANK[a.weight] : 0;
          const wb = b.weight ? WEIGHT_RANK[b.weight] : 0;
          if (wb !== wa) return wb - wa;
          return b.created_at.localeCompare(a.created_at);
        });
      }
      return rows;
    },
  });
}

/** One note plus its thread (R7.5), for the detail view. */
export function useFeedbackNote(feedbackId: string | null | undefined) {
  return useQuery({
    queryKey: ['feedback-note', feedbackId],
    enabled: !!feedbackId,
    queryFn: async (): Promise<{ note: Feedback; events: FeedbackEvent[] } | null> => {
      if (!feedbackId) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const [{ data: note, error: noteErr }, { data: events, error: evErr }] =
        await Promise.all([
          supabase.from('feedback').select('*').eq('id', feedbackId).single(),
          supabase
            .from('feedback_events')
            .select('*')
            .eq('feedback_id', feedbackId)
            .order('created_at', { ascending: true }),
        ]);

      if (noteErr) throw noteErr;
      if (evErr) throw evErr;
      return { note: note as Feedback, events: (events ?? []) as FeedbackEvent[] };
    },
  });
}

/**
 * The current user's OWN shipped-and-unseen notes — powers the capture-button
 * badge (R7.1.7). Filtered to created_by so a super_admin doesn't badge on
 * everyone's shipped notes.
 */
export function useUnseenShipped() {
  return useQuery({
    queryKey: ['feedback-unseen-shipped'],
    queryFn: async (): Promise<Feedback[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('feedback')
        .select('*')
        .eq('created_by', user.id)
        .eq('status', 'shipped')
        .is('shipped_seen_at', null)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Feedback[];
    },
  });
}

/** Resolve a screenshot_path to a short-lived signed URL for the detail view. */
export function useSignedScreenshotUrl(screenshotPath: string | null | undefined) {
  return useQuery({
    queryKey: ['feedback-screenshot-url', screenshotPath],
    enabled: !!screenshotPath,
    staleTime: (SIGNED_URL_TTL_SECONDS - 5) * 1000,
    queryFn: async (): Promise<string | null> => {
      if (!screenshotPath) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.storage
        .from(SCREENSHOT_BUCKET)
        .createSignedUrl(screenshotPath, SIGNED_URL_TTL_SECONDS);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// WRITE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Leave a note (R7.2). Generates the row id client-side so the optional
 * screenshot can be uploaded to feedback-screenshots/{uid}/{id}.png before the
 * row is written; created_by defaults to auth.uid() server-side.
 */
export function useCreateFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateFeedbackInput): Promise<Feedback> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const id = crypto.randomUUID();

      let screenshot_path: string | null = null;
      if (input.screenshot) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const path = `${user.id}/${id}.png`;
          const { error: upErr } = await supabase.storage
            .from(SCREENSHOT_BUCKET)
            .upload(path, input.screenshot, { contentType: 'image/png', upsert: false });
          // A screenshot failure must not lose the note — capture still lands.
          if (!upErr) screenshot_path = path;
        }
      }

      const { data, error } = await supabase
        .from('feedback')
        .insert({
          id,
          bucket: input.bucket,
          note: input.note?.trim() || null,
          weight: input.weight ?? null,
          screen_name: input.screen_name ?? null,
          route: input.route ?? null,
          app_version: input.app_version ?? null,
          viewport: input.viewport ?? null,
          element: input.element ?? null,
          screenshot_path,
          report_kind: input.report_kind ?? 'note',
          user_agent: input.user_agent ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as Feedback;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
    },
  });
}

/** Move a note through its lifecycle (R7.4.4/R7.6.2). Builder: any transition;
 *  author: shipped→building reopen only (enforced server-side). */
export function useSetFeedbackStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      note,
    }: {
      id: string;
      status: FeedbackStatus;
      note?: string;
    }): Promise<Feedback> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('set_feedback_status', {
        p_id: id,
        p_status: status,
        p_note: note ?? null,
      });
      if (error) throw error;
      return data as Feedback;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
      queryClient.invalidateQueries({ queryKey: ['feedback-note', vars.id] });
      queryClient.invalidateQueries({ queryKey: ['feedback-unseen-shipped'] });
    },
  });
}

/** React to a shipped note (R7.6.2). */
export function useReactToFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, emoji }: { id: string; emoji: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.rpc('react_to_feedback', {
        p_id: id,
        p_emoji: emoji,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['feedback-note', vars.id] });
    },
  });
}

/** Reply on a note's thread (R7.5.4). */
export function useReplyToFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.rpc('reply_to_feedback', {
        p_id: id,
        p_text: text,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['feedback-note', vars.id] });
    },
  });
}

/** Mark a shipped note seen — clears the capture-button badge (R7.6.3). */
export function useMarkFeedbackSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.rpc('mark_feedback_seen', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback-unseen-shipped'] });
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
    },
  });
}
