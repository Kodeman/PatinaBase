'use client';

/**
 * US-49 Phase 2 — the Press band (PLAN §designer loop; canvas board
 * Press-Band-Designer). The studio's one place for the client's House Issue:
 *   · a new edition waiting → its preview and Approve / Hold / Edit;
 *   · otherwise which edition the client sees; before any, that the page
 *     shows the editorial cover, or that the cover is still a drawing when
 *     no photograph can open it;
 *   · every published edition, studio-approved or plates-only, newest first,
 *     with Undo on the one the client sees now.
 * The band says an edition is ready, never why. Edits (cover, chapter words,
 * caption whose/when) gather into overrides that go with Approve; there is no
 * way to ask for a different edition. The show-makers switch and the focal
 * points save on their own, outside any draft, as they belong to the job and
 * its photographs. A closed project's frozen edition offers no act at all.
 */

import { useEffect, useId, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@patina/design-system';
import {
  useApproveClientEdition,
  useClientEditionSourceUrls,
  useClientEditions,
  useClientEditorialAssets,
  useHoldClientEdition,
  useProjectDeadPictureLinks,
  useSetProjectShowMakers,
  useUndoClientEdition,
  type ClientEdition,
  type ClientEditionImage,
  type ClientEditionOverrides,
} from '@patina/supabase';
import { Input, Textarea } from '@/components/ui/controls';
import { ActFailLine } from '@/components/feedback/act-fail-line';
import { getThumbnailUrl } from '@/lib/media-utils';
import { sectionAnchorId } from '@/lib/document/section-anchor';
import {
  currentEdition,
  editionUndoRestores,
  editionsFrozen,
  pendingEdition,
  wasPublished,
} from '@/lib/document/client-editions';
import { heroEligible } from '@/lib/document/plate-crop';
import { DocumentAction, DocumentActionRow } from './document-action';
import {
  PressBandPreview,
  editionChapters,
  editionHeroId,
  imageCaption,
} from './press-band-preview';
import { PressBandFocal } from './press-band-focal';
import { DEAD_PICTURE_COPY } from './line-unfold/item-pictures';
import { FOCUS_FFE_LINE_EVENT, focusFfeLinePending } from '@/lib/document/registry';

export const EDITION_READY = 'A new edition is ready';
export const COVER_IS_A_DRAWING = 'The cover is a drawing until a photograph arrives';
export const HEADLINE_MAX = 60;
export const STANDING_MAX = 160;

const EYEBROW =
  'font-mono text-[12px] font-medium uppercase leading-normal tracking-[0.12em] text-[var(--text-muted)]';

const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });

function dayMonth(at: string | null | undefined): string | null {
  const date = at ? new Date(at) : null;
  return date && !Number.isNaN(date.getTime()) ? DAY_MONTH.format(date) : null;
}

const firstWord = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || null;
const sentenceStart = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/** "Edition 4 · approved by Maren · 21 October" / "Edition 5 · plates only · published 22 October". */
export function publishedLine(edition: ClientEdition): string {
  const on = dayMonth(edition.approvedAt ?? edition.reviewedAt);
  const parts = edition.autoPublished
    ? [`Edition ${edition.seq}`, 'plates only', on && `published ${on}`]
    : [
        `Edition ${edition.seq}`,
        `approved by ${firstWord(edition.reviewedBy?.name) ?? 'the studio'}`,
        on,
      ];
  return parts.filter(Boolean).join(' · ');
}

/** Drop untouched fields so Approve sends only what the studio changed. */
function prune(overrides: ClientEditionOverrides): ClientEditionOverrides {
  const out: ClientEditionOverrides = {};
  if (overrides.heroAssetId) out.heroAssetId = overrides.heroAssetId;
  for (const field of ['chapters', 'captions'] as const) {
    const entries = Object.entries(overrides[field] ?? {}).filter(
      ([, value]) => Object.keys(value).length > 0,
    );
    if (entries.length) (out as Record<string, unknown>)[field] = Object.fromEntries(entries);
  }
  return out;
}

/** An edition's pictures, one per asset, in its own order. */
function uniqueImages(images: readonly ClientEditionImage[]): ClientEditionImage[] {
  return [...new Map(images.map((image) => [image.assetId, image] as const)).values()];
}

/** The pictures offered for the cover: every picture of the edition, never a
 *  concept render (R142). */
function heroChoices(edition: ClientEdition): ClientEditionImage[] {
  return uniqueImages(edition.images).filter((image) => image.sourceKind !== 'concept');
}

const HEADING = 'font-display text-[22px] font-normal leading-tight';

export function PressBand({
  projectId,
  clientFirstName,
}: {
  projectId: string;
  /** The client's first name as the letterhead prints it; null → "the client". */
  clientFirstName: string | null;
}) {
  // The open job reads live: the compose lane publishes with no studio act.
  const { data, refetch, isFetching } = useClientEditions(projectId, { live: true });
  const editions = data?.editions ?? [];
  const pending = pendingEdition(editions);
  const current = currentEdition(editions);
  // Only the SQL-marked closing draft can be reviewed after the job closes.
  const frozen = editionsFrozen(editions, data?.projectClosed === true);
  const closingPending = data?.projectClosed === true && pending?.closing === true;
  const { data: sourceUrls } = useClientEditionSourceUrls(
    frozen ? (closingPending ? uniqueImages(pending.images) : [])
      : uniqueImages([...(pending?.images ?? []), ...(current?.images ?? [])]),
  );
  // Before any edition the client page opens on the editorial cover.
  const { data: editorialAssets } = useClientEditorialAssets(projectId, !!data && !data.refreshRequired && !pending && !current);
  const headingId = useId();
  if (!data) return null;
  if (data.refreshRequired) {
    return (
      <section aria-labelledby={headingId} data-press-band className="mt-3 flex flex-col gap-2 text-left">
        <h2 id={headingId} className={HEADING}>Edition approved</h2>
        <p role="status" className="text-[15px]">Refresh to see the latest edition.</p>
        <DocumentAction
          actionKey="press-refresh-editions"
          surfaceKey="open-document"
          regionKey="press-band"
          variant="secondary"
          loading={isFetching}
          loadingLabel="Refreshing…"
          onClick={() => { void refetch(); }}
        >
          Refresh editions
        </DocumentAction>
      </section>
    );
  }

  const name = clientFirstName || 'the client';
  const published = editions.filter(wasPublished);
  const urls = sourceUrls ?? {};

  return (
    <section
      aria-labelledby={headingId}
      data-press-band
      className="mt-3 flex w-full max-w-[760px] flex-col gap-4 rounded-[4px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] px-4 py-3 text-left"
    >
      {pending && (!frozen || closingPending) ? (
        <PendingEdition
          key={pending.id}
          headingId={headingId}
          projectId={projectId}
          edition={pending}
          allowEdit={!frozen}
          current={current}
          name={name}
          sourceUrls={urls}
        />
      ) : current ? (
        <h2 id={headingId} className={HEADING}>
          Edition {current.seq} is what {name} sees
        </h2>
      ) : frozen ? (
        <h2 id={headingId} className={HEADING}>Closed</h2>
      ) : editorialAssets && !editorialAssets.some(heroEligible) ? (
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className={HEADING}>
            {COVER_IS_A_DRAWING}
          </h2>
          <DocumentActionRow surfaceKey="open-document" regionKey="press-band" aria-label="Cover">
            <DocumentAction
              actionKey="press-add-cover-photo"
              variant="secondary"
              href={`#${sectionAnchorId('project')}`}
            >
              Add a photograph for the cover
            </DocumentAction>
          </DocumentActionRow>
        </div>
      ) : (
        <h2 id={headingId} className={HEADING}>
          {editorialCoverLine(name)}
        </h2>
      )}
      <DeadPictureLinks projectId={projectId} />
      {!frozen && (
        <JobControls
          projectId={projectId}
          name={name}
          showMakers={data.showMakers}
          current={current}
          sourceUrls={urls}
        />
      )}
      {published.length > 0 && (
        <PublishedEditions
          projectId={projectId}
          editions={editions}
          published={published}
          name={name}
          closed={frozen}
        />
      )}
    </section>
  );
}

/** Before the first approved edition, when the page has a photograph to open on. */
export const editorialCoverLine = (name: string) =>
  `${sentenceStart(name)}’s page shows the editorial cover until an edition is approved`;

/**
 * What belongs to the job and its photographs rather than to one edition's
 * words, so it saves on its own whenever the job has a project: whether the
 * makers are named, and the focal point of each photograph the client sees.
 */
function JobControls({
  projectId,
  name,
  showMakers,
  current,
  sourceUrls,
}: {
  projectId: string;
  name: string;
  showMakers: boolean;
  current: ClientEdition | null;
  sourceUrls: Record<string, string>;
}) {
  const setShowMakers = useSetProjectShowMakers();
  const photographs = current
    ? uniqueImages(current.images).filter((image) => sourceUrls[image.assetId])
    : [];
  return (
    <div className="flex flex-col gap-4 border-t border-[var(--border-subtle)] pt-3" data-press-job>
      {current && photographs.length > 0 && (
        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className={EYEBROW}>Focal points · edition {current.seq}</legend>
          {photographs.map((image) => (
            <div key={image.assetId} className="flex flex-col gap-1">
              <p className="text-[15px] leading-snug">{image.captionWhat || image.alt || 'A photograph'}</p>
              <PressBandFocal projectId={projectId} image={image} sourceUrl={sourceUrls[image.assetId]} />
            </div>
          ))}
        </fieldset>
      )}
      <div className="flex flex-col gap-1">
        <label className="inline-flex min-h-[44px] items-center gap-3 text-[15px]">
          <input
            type="checkbox"
            role="switch"
            aria-checked={showMakers}
            checked={showMakers}
            disabled={setShowMakers.isPending}
            onChange={(event) => setShowMakers.mutate({ projectId, show: event.target.checked })}
            className="h-5 w-5 accent-[var(--ink)]"
          />
          Name the makers on {name}’s page
        </label>
        <ActFailLine error={setShowMakers.error} />
      </div>
    </div>
  );
}

function PendingEdition({
  headingId,
  projectId,
  edition,
  current,
  name,
  sourceUrls,
  allowEdit,
}: {
  headingId: string;
  allowEdit: boolean;
  projectId: string;
  edition: ClientEdition;
  current: ClientEdition | null;
  name: string;
  sourceUrls: Record<string, string>;
}) {
  const [editing, setEditing] = useState(false);
  const [overrides, setOverrides] = useState<ClientEditionOverrides>({});
  const approve = useApproveClientEdition();
  const hold = useHoldClientEdition();
  const trayId = useId();

  const stays = current
    ? `Edition ${current.seq} stays on ${name}’s page.`
    : `${sentenceStart(name)}’s page stays as it is.`;
  const standing = edition.held
    ? `Held. ${stays}`
    : `Approve puts it on ${name}’s page. Hold keeps ${current ? `edition ${current.seq} there` : 'the page as it is'}.`;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={headingId} className="font-display text-[22px] font-normal leading-tight">
            {EDITION_READY}
          </h2>
          <p className="text-[15px] leading-snug text-[var(--text-muted)]">{standing}</p>
        </div>
        <DocumentActionRow surfaceKey="open-document" regionKey="press-band" aria-label="Edition actions">
          <DocumentAction
            actionKey="press-approve"
            variant="primary"
            disabled={approve.isPending}
            loading={approve.isPending}
            loadingLabel="Approving…"
            onClick={() =>
              approve.mutate(
                { projectId, editionId: edition.id, overrides: prune(overrides) },
                {
                  onSuccess: () => {
                    setOverrides({});
                    setEditing(false);
                  },
                },
              )
            }
          >
            Approve
          </DocumentAction>
          {!edition.held && (
            <DocumentAction
              actionKey="press-hold"
              variant="secondary"
              loading={hold.isPending}
              loadingLabel="Holding…"
              onClick={() => hold.mutate({ projectId, editionId: edition.id })}
            >
              Hold
            </DocumentAction>
          )}
          {allowEdit && <DocumentAction
            actionKey="press-edit"
            variant="tertiary"
            aria-expanded={editing}
            aria-controls={trayId}
            onClick={() => setEditing((open) => !open)}
          >
            Edit
          </DocumentAction>}
        </DocumentActionRow>
      </div>
      <ActFailLine error={approve.error ?? hold.error} />
      <PressBandPreview
        edition={edition}
        current={current}
        overrides={overrides}
        sourceUrls={sourceUrls}
      />
      {allowEdit && editing && (
        <EditTray
          id={trayId}
          projectId={projectId}
          edition={edition}
          overrides={overrides}
          onChange={setOverrides}
          sourceUrls={sourceUrls}
        />
      )}
    </>
  );
}

function Counted({
  label,
  value,
  max,
  multiline,
  onChange,
}: {
  label: string;
  value: string;
  max: number;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const countId = `${id}-count`;
  const field = {
    id,
    value,
    maxLength: max,
    'aria-describedby': countId,
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
  };
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[14px] text-[var(--text-muted)]">
        {label}
      </label>
      {multiline ? <Textarea rows={2} {...field} /> : <Input {...field} />}
      <span id={countId} className="self-end font-mono text-[12px] text-[var(--text-muted)]">
        {value.length}/{max}
      </span>
    </div>
  );
}

function EditTray({
  id,
  projectId,
  edition,
  overrides,
  onChange,
  sourceUrls,
}: {
  id: string;
  projectId: string;
  edition: ClientEdition;
  overrides: ClientEditionOverrides;
  onChange: (next: ClientEditionOverrides) => void;
  sourceUrls: Record<string, string>;
}) {
  const heroId = editionHeroId(edition, overrides);
  const hero = edition.images.find((image) => image.assetId === heroId) ?? null;
  const choices = heroChoices(edition);
  const captioned = uniqueImages(edition.images);

  const setChapter = (key: string, field: 'headline' | 'standing', value: string) =>
    onChange({
      ...overrides,
      chapters: { ...overrides.chapters, [key]: { ...overrides.chapters?.[key], [field]: value } },
    });
  const setCaption = (assetId: string, field: 'whose' | 'when', value: string) =>
    onChange({
      ...overrides,
      captions: { ...overrides.captions, [assetId]: { ...overrides.captions?.[assetId], [field]: value } },
    });

  return (
    <div id={id} className="flex flex-col gap-6 border-t border-[var(--border-subtle)] pt-4" data-press-edit>
      {choices.length > 0 && (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className={EYEBROW}>The cover</legend>
          <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
            {choices.map((image) => {
              const url = sourceUrls[image.assetId];
              const label = image.captionWhat || image.alt || 'A photograph';
              return (
                <li key={image.assetId} className="flex w-[120px] flex-col gap-1">
                  <button
                    type="button"
                    aria-pressed={image.assetId === heroId}
                    aria-label={label}
                    onClick={() => onChange({ ...overrides, heroAssetId: image.assetId })}
                    className={`block h-[75px] w-[120px] overflow-hidden rounded-[4px] bg-[var(--paper)] p-0 focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${
                      image.assetId === heroId
                        ? 'border-[3px] border-[var(--ink)]'
                        : 'border border-[var(--border-default)]'
                    }`}
                  >
                    {url && (
                      <img src={getThumbnailUrl(url, 240)} alt="" className="block h-full w-full object-cover" />
                    )}
                  </button>
                  <span className="text-[14px] leading-snug">{label}</span>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {hero && sourceUrls[hero.assetId] && (
        <PressBandFocal
          key={hero.assetId}
          projectId={projectId}
          image={hero}
          sourceUrl={sourceUrls[hero.assetId]}
        />
      )}

      {editionChapters(edition, overrides).length > 0 && (
        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className={EYEBROW}>Every chapter opener</legend>
          {editionChapters(edition, overrides).map((chapter, index) => (
            <div key={chapter.key} className="grid gap-2 border-b border-[var(--border-subtle)] pb-3">
              <p className="font-mono text-[14px] text-[var(--text-muted)]">
                {String(index + 1).padStart(2, '0')}
              </p>
              <Counted
                label="Headline"
                value={chapter.headline}
                max={HEADLINE_MAX}
                onChange={(value) => setChapter(chapter.key, 'headline', value)}
              />
              <Counted
                label="Standing sentence"
                value={chapter.standing}
                max={STANDING_MAX}
                multiline
                onChange={(value) => setChapter(chapter.key, 'standing', value)}
              />
            </div>
          ))}
        </fieldset>
      )}

      {captioned.length > 0 && (
        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className={EYEBROW}>Captions</legend>
          {captioned.map((image) => {
            const caption = imageCaption(edition, image, overrides);
            return (
              <div key={image.assetId} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <p className="text-[15px] sm:col-span-2">{caption.what || image.alt || 'A photograph'}</p>
                <Counted
                  label="Whose"
                  value={caption.whose}
                  max={HEADLINE_MAX}
                  onChange={(value) => setCaption(image.assetId, 'whose', value)}
                />
                <Counted
                  label="When"
                  value={caption.when}
                  max={HEADLINE_MAX}
                  onChange={(value) => setCaption(image.assetId, 'when', value)}
                />
              </div>
            );
          })}
        </fieldset>
      )}
    </div>
  );
}

function DeadPictureLinks({ projectId }: { projectId: string }) {
  const { data: items } = useProjectDeadPictureLinks(projectId);
  if (!items?.length) return null;
  return (
    <ul aria-label="Pictures to replace" className="m-0 list-none p-0 text-[15px] text-[var(--text-muted)]">
      {items.map((item) => (
        <li key={item.itemId}>
          {item.name} · {DEAD_PICTURE_COPY}
          <DocumentAction
            actionKey="press-replace-picture"
            regionKey="press-band"
            variant="secondary"
            href={`#pictures-head-${item.itemId}`}
            onClick={(event) => {
              event.preventDefault();
              const request = { itemId: item.itemId, cell: 'pictures' as const };
              focusFfeLinePending.request = request;
              window.dispatchEvent(new CustomEvent(FOCUS_FFE_LINE_EVENT, { detail: request }));
            }}
          >
            Replace picture
          </DocumentAction>
        </li>
      ))}
    </ul>
  );
}

function PublishedEditions({
  projectId,
  editions,
  published,
  name,
  closed,
}: {
  projectId: string;
  editions: ClientEdition[];
  published: ClientEdition[];
  name: string;
  /** The job is closed: its approved edition reads Closed, never Undo. */
  closed: boolean;
}) {
  const undo = useUndoClientEdition();
  const [asking, setAsking] = useState<ClientEdition | null>(null);
  const canUndo = asking !== null && !closed && editions.some(
    (edition) => edition.id === asking.id && edition.status === 'approved' && !edition.frozenAt,
  );
  useEffect(() => {
    if (!canUndo) setAsking(null);
  }, [canUndo]);
  // The edition the server restores, not merely an earlier number.
  const before = asking ? editionUndoRestores(editions, asking) : null;
  const consequence = asking
    ? before
      ? `${sentenceStart(name)} will see edition ${before.seq} again.`
      : `${sentenceStart(name)} will see the page as it was before edition ${asking.seq}.`
    : '';

  return (
    <div className="flex flex-col gap-1">
      <p className={EYEBROW}>Published editions</p>
      <ul aria-label="Published editions" className="m-0 list-none border-t border-[var(--border-subtle)] p-0">
        {published.map((edition) => (
          <li
            key={edition.id}
            className="flex min-h-[44px] flex-wrap items-center justify-between gap-x-4 border-b border-[var(--border-subtle)] py-1 text-[15px]"
            data-published-edition={edition.seq}
          >
            <span>{publishedLine(edition)}</span>
            {edition.frozenAt || (closed && edition.status === 'approved') ? (
              <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Closed
              </span>
            ) : edition.status === 'approved' ? (
              <DocumentAction
                actionKey="press-undo"
                surfaceKey="open-document"
                regionKey="press-band-published"
                variant="tertiary"
                loading={undo.isPending}
                loadingLabel="Undoing…"
                onClick={() => setAsking(edition)}
              >
                Undo
              </DocumentAction>
            ) : null}
          </li>
        ))}
      </ul>
      <ActFailLine error={undo.error} />
      <AlertDialog open={canUndo} onOpenChange={(open) => !open && setAsking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo edition {asking?.seq}?</AlertDialogTitle>
            <AlertDialogDescription>{consequence}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep edition {asking?.seq}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (canUndo && asking) undo.mutate({ projectId, editionId: asking.id });
                setAsking(null);
              }}
            >
              Undo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
