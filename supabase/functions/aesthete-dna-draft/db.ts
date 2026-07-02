// Supabase implementation of DbPort for aesthete-dna-draft (Wave 2C).
//
// Service-role client: claim_aesthete_jobs / complete_aesthete_job are
// GRANT-ed to service_role only (00241), and product_dna_drafts has no INSERT
// policy at all — the service role bypasses RLS by design (00240).
//
// Drafts-never-canon (§5.2): this adapter has no code path that can write
// product_dna or product_style_spectrum.
//
// NOTE: agent 2B is concurrently building supabase/functions/_shared/
// aesthete.ts (claim/complete + admin-client helpers). The claim/complete
// calls below are written against the same RPC signatures
// (claim_aesthete_jobs(p_kind, p_batch) / complete_aesthete_job(p_id,
// p_status, p_error)); the conductor unifies onto the shared helper at merge.

// deno-lint-ignore-file no-explicit-any

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  ArchetypeRow,
  DbPort,
  DraftInsert,
  JobRow,
  ProductRow,
  SpendDelta,
  StyleInsert,
  TriagePatch,
} from './lib.ts';

export function createDb(supabaseUrl: string, serviceRoleKey: string): DbPort {
  const client: SupabaseClient = createClient(supabaseUrl, serviceRoleKey);
  return new SupabaseDb(client);
}

class SupabaseDb implements DbPort {
  constructor(private client: SupabaseClient) {}

  async getSpendToday(day: string): Promise<{ usd: number } | null> {
    const { data, error } = await this.client
      .from('aesthete_spend_ledger')
      .select('usd')
      .eq('day', day)
      .maybeSingle();
    if (error) throw new Error(`spend ledger read failed: ${error.message}`);
    return data ? { usd: Number((data as any).usd ?? 0) } : null;
  }

  async loadArchetypes(): Promise<ArchetypeRow[]> {
    const { data, error } = await this.client
      .from('styles')
      .select('id, name, description, visual_markers')
      .eq('is_archetype', true)
      .order('display_order', { ascending: true });
    if (error) throw new Error(`styles read failed: ${error.message}`);
    return (data ?? []) as ArchetypeRow[];
  }

  async claimJobs(kind: string, batch: number): Promise<JobRow[]> {
    const { data, error } = await this.client.rpc('claim_aesthete_jobs', {
      p_kind: kind,
      p_batch: batch,
    });
    if (error) throw new Error(`claim_aesthete_jobs failed: ${error.message}`);
    return ((data ?? []) as any[]).map((j) => ({
      id: Number(j.id),
      kind: j.kind,
      product_id: j.product_id ?? null,
    }));
  }

  async completeJob(id: number, status: 'done' | 'failed', errorText?: string): Promise<void> {
    const { error } = await this.client.rpc('complete_aesthete_job', {
      p_id: id,
      p_status: status,
      p_error: errorText ?? null,
    });
    if (error) throw new Error(`complete_aesthete_job failed: ${error.message}`);
  }

  async loadProduct(productId: string): Promise<ProductRow | null> {
    const { data, error } = await this.client
      .from('products')
      .select(
        'id, name, brand, category, subcategory, description, short_description, materials, price_retail, images, source_url',
      )
      .eq('id', productId)
      .maybeSingle();
    if (error) throw new Error(`product read failed: ${error.message}`);
    return (data as ProductRow) ?? null;
  }

  async getDraft(
    productId: string,
    promptVersion: string,
  ): Promise<{ id: number; overall_confidence: number | null } | null> {
    const { data, error } = await this.client
      .from('product_dna_drafts')
      .select('id, overall_confidence')
      .eq('product_id', productId)
      .eq('prompt_version', promptVersion)
      .maybeSingle();
    if (error) throw new Error(`draft read failed: ${error.message}`);
    return data
      ? {
        id: Number((data as any).id),
        overall_confidence: (data as any).overall_confidence === null
          ? null
          : Number((data as any).overall_confidence),
      }
      : null;
  }

  async insertDraft(row: DraftInsert): Promise<void> {
    const { error } = await this.client.from('product_dna_drafts').insert(row);
    if (error) {
      // Concurrent writer landed first on UNIQUE(product_id, prompt_version):
      // treat as done — the incumbent policy re-applies next re-enqueue.
      if (error.code === '23505') return;
      throw new Error(`draft insert failed: ${error.message}`);
    }
  }

  async updateDraft(id: number, row: DraftInsert): Promise<void> {
    const { error } = await this.client
      .from('product_dna_drafts')
      .update({
        draft: row.draft,
        model: row.model,
        overall_confidence: row.overall_confidence,
      })
      .eq('id', id);
    if (error) throw new Error(`draft update failed: ${error.message}`);
  }

  async listStyles(productId: string): Promise<{ style_id: string; source: string }[]> {
    const { data, error } = await this.client
      .from('product_styles')
      .select('style_id, source')
      .eq('product_id', productId);
    if (error) throw new Error(`product_styles read failed: ${error.message}`);
    return (data ?? []) as { style_id: string; source: string }[];
  }

  async deleteMlStyles(productId: string): Promise<void> {
    const { error } = await this.client
      .from('product_styles')
      .delete()
      .eq('product_id', productId)
      .eq('source', 'ml_predicted');
    if (error) throw new Error(`ml style delete failed: ${error.message}`);
  }

  async insertStyles(rows: StyleInsert[]): Promise<void> {
    const { error } = await this.client.from('product_styles').insert(rows);
    if (error) throw new Error(`product_styles insert failed: ${error.message}`);
  }

  async applyTriage(productId: string, patch: TriagePatch): Promise<void> {
    // Only touch rows still awaiting teaching; never disturb in-progress or
    // validated queue states. Row should exist (00005 trigger seeds it on
    // product insert) — insert as a fallback for legacy rows.
    const { data, error } = await this.client
      .from('teaching_queue')
      .update(patch)
      .eq('product_id', productId)
      .eq('status', 'pending')
      .select('id');
    if (error) throw new Error(`teaching_queue update failed: ${error.message}`);
    if ((data ?? []).length > 0) return;

    const { data: existing, error: existsError } = await this.client
      .from('teaching_queue')
      .select('id')
      .eq('product_id', productId)
      .maybeSingle();
    if (existsError) throw new Error(`teaching_queue read failed: ${existsError.message}`);
    if (existing) return; // non-pending row — leave it alone

    const { error: insertError } = await this.client
      .from('teaching_queue')
      .insert({ product_id: productId, ...patch });
    if (insertError && insertError.code !== '23505') {
      throw new Error(`teaching_queue insert failed: ${insertError.message}`);
    }
  }

  async addSpend(day: string, delta: SpendDelta): Promise<void> {
    // Read-modify-write upsert. The cron runs one invocation at a time
    // (2-min cadence vs a hard sub-60s deadline), so lost-update races are
    // effectively impossible; if invocations ever overlap the governor still
    // parks within one batch of the budget.
    const { data, error } = await this.client
      .from('aesthete_spend_ledger')
      .select('input_tokens, output_tokens, cache_read_tokens, usd, products')
      .eq('day', day)
      .maybeSingle();
    if (error) throw new Error(`spend ledger read failed: ${error.message}`);

    const current = (data ?? {}) as any;
    const { error: upsertError } = await this.client.from('aesthete_spend_ledger').upsert(
      {
        day,
        input_tokens: Number(current.input_tokens ?? 0) + delta.input_tokens,
        output_tokens: Number(current.output_tokens ?? 0) + delta.output_tokens,
        cache_read_tokens: Number(current.cache_read_tokens ?? 0) + delta.cache_read_tokens,
        usd: Math.round((Number(current.usd ?? 0) + delta.usd) * 100) / 100,
        products: Number(current.products ?? 0) + delta.products,
      },
      { onConflict: 'day' },
    );
    if (upsertError) throw new Error(`spend ledger upsert failed: ${upsertError.message}`);
  }
}
