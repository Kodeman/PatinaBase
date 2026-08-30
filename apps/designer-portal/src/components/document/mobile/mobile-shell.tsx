'use client';

/**
 * The D13 mobile shell — the phone's physics for the document model
 * (spec v1.3 §3 "Mobile", D13; canonical prototype
 * patina-the-document-mobile-d3-v1.html). The unified bar owns widths below
 * 1180px; the shared timer sheet also serves the compact spine through 1439px.
 *
 * Three rulings, ported as INTENT (never markup):
 *   D3-1  one unified bottom bar owns the thumb edge — on the Desk: drawer
 *         handle + "in hand today"; in a document: section handle (→ spine
 *         sheet) + timer glance (→ timer sheet) + drawer book.
 *   D3-2  margin items are chips beneath their anchored line → tap raises the
 *         item as a paper bottom sheet with its actions (mobile-margin-chips).
 *   D3-3  the spine sheet doubles: sections on top, "In the margin · N"
 *         beneath, each row jumping to its anchor.
 *
 * Materials: paper sheets = document parts (spine, item, timer); the drawer's
 * books open the existing charcoal DocSheet ledgers (open-ledger event).
 * Scrim dimming, no shadows (D4).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { SpineSection } from '@/lib/document/section-derivation';
import type { DocumentIndexKey } from '@/lib/document/document-index';

export interface MobileActiveDoc {
  projectId: string | null;
  proposalId: string | null;
  clientName: string;
  title: string;
  sections: SpineSection[];
  /** R25: room headings join the spine sheet as jump rows. */
  rooms?: { id: string; name: string }[];
  /**
   * A-08: the current reading stop, mirrored from the page's running index
   * (`activeKey`) so the mobile bar can print "AT <STOP>" without its own
   * subscription. Optional so a caller that predates A-08 still type-checks;
   * treated as null when absent.
   */
  readingIndex?: DocumentIndexKey | null;
  /** W2 · the ladder's per-stop values for the open spread. The sections sheet
   *  mounts in `(document)/layout.tsx`, above the page that derives them, so
   *  they ride the published document rather than a prop the layout has no way
   *  to fill. */
  ladderValues?: Partial<Record<DocumentIndexKey, string>>;
  /** DL-04 · this spread carries a client's copy, so the sections sheet prints
   *  the fifth door under `Filed with this job`. */
  clientCopy?: boolean;
  /** D-B18 · the page's region-jump handler: `requestRegionUnfold` →
   *  `forceFullThrough` → `scrollToRegion`. The sections sheet mounts in
   *  `(document)/layout.tsx`, above the page that owns the lens, so the press
   *  order rides the published document. Without it the sheet scrolls to a
   *  stop whose body the lens has not been asked to promote, and the landing
   *  reads a y that the promotion then moves.
   *
   *  REQUIRED. It was optional, which made a sections-sheet press a silent
   *  no-op if a publisher ever forgot it — where the pre-D-B18 code at least
   *  scrolled. `page.tsx` is the only publisher and always supplies it. */
  onJumpRegion: (key: DocumentIndexKey) => void;
  /** D-B30 · the letterhead- and section-anchored margin count (the same set
   *  `useMarginSheet` lists — W5-R1's whole margin), so the bar's `Margin · N` door and the
   *  Margin sheet's head can print it without their own subscription.
   *  Optional so a caller that predates D-B30 still type-checks. */
  marginCount?: number | null;
}

type Sheet =
  | { kind: 'spine' }
  | { kind: 'timer' }
  | { kind: 'drawer' }
  | { kind: 'margin-item'; itemId: string }
  | { kind: 'margin' }
  /** W5-R4(a)/D-B44 — the margin's own note composer, text only. The Field
   *  app keeps photo and voice; the web has no capture path for either. */
  | { kind: 'note' };

export type MobilePrimaryAction = {
  actionKey: string;
  surfaceKey: string;
  regionKey: string;
  label: string;
  target:
    | { kind: 'press'; onPress: () => void }
    | { kind: 'href'; href: string };
  disabled?: boolean;
  loading?: boolean;
  onSelected?: () => void;
};

/** A surface-owned quiet act that belongs inside MobileBar's More disclosure. */
export type MobileSecondaryAction = {
  actionKey: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

interface MobileShellValue {
  activeDoc: MobileActiveDoc | null;
  setActiveDoc: (d: MobileActiveDoc | null) => void;
  sheet: Sheet | null;
  openSpine: () => void;
  openTimer: () => void;
  openDrawer: () => void;
  openMarginItem: (itemId: string) => void;
  openMargin: () => void;
  /** W5-R4(a) — `CAPTURE A NOTE`, the Margin sheet's lead act. */
  openNote: () => void;
  closeSheet: () => void;
  primaryAction: MobilePrimaryAction | null;
  registerPrimaryAction: (
    owner: symbol,
    action: MobilePrimaryAction | null,
    priority: number,
  ) => void;
  secondaryActions: MobileSecondaryAction[];
  registerSecondaryAction: (
    owner: symbol,
    action: MobileSecondaryAction | null,
  ) => void;
}

const Ctx = createContext<MobileShellValue | null>(null);

export function useMobileShell(): MobileShellValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMobileShell requires MobileShellProvider');
  return v;
}

export function MobileShellProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeDoc, setActiveDoc] = useState<MobileActiveDoc | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [primaryAction, setPrimaryAction] =
    useState<MobilePrimaryAction | null>(null);
  const [secondaryActions, setSecondaryActions] = useState<
    MobileSecondaryAction[]
  >([]);
  const primaryRegistry = useRef(
    new Map<
      symbol,
      { action: MobilePrimaryAction; priority: number; sequence: number }
    >(),
  );
  const primarySequence = useRef(0);
  const secondaryRegistry = useRef(
    new Map<symbol, { action: MobileSecondaryAction; sequence: number }>(),
  );
  const secondarySequence = useRef(0);

  const registerPrimaryAction = useCallback(
    (owner: symbol, action: MobilePrimaryAction | null, priority: number) => {
      if (action) {
        const existing = primaryRegistry.current.get(owner);
        primaryRegistry.current.set(owner, {
          action,
          priority,
          sequence: existing?.sequence ?? ++primarySequence.current,
        });
      } else {
        primaryRegistry.current.delete(owner);
      }

      const next = [...primaryRegistry.current.values()].sort(
        (a, b) => b.priority - a.priority || b.sequence - a.sequence,
      )[0]?.action;
      setPrimaryAction(next ?? null);
    },
    [],
  );

  const registerSecondaryAction = useCallback(
    (owner: symbol, action: MobileSecondaryAction | null) => {
      if (action) {
        const existing = secondaryRegistry.current.get(owner);
        secondaryRegistry.current.set(owner, {
          action,
          sequence: existing?.sequence ?? ++secondarySequence.current,
        });
      } else {
        secondaryRegistry.current.delete(owner);
      }

      // A surface can briefly mount the same instrument by two paths during a
      // transition. Keep the latest owner and show one menu act per action key.
      const seen = new Set<string>();
      const next = [...secondaryRegistry.current.values()]
        .sort((a, b) => b.sequence - a.sequence)
        .flatMap(({ action: registered }) => {
          if (seen.has(registered.actionKey)) return [];
          seen.add(registered.actionKey);
          return [registered];
        });
      setSecondaryActions(next);
    },
    [],
  );

  const value = useMemo<MobileShellValue>(
    () => ({
      activeDoc,
      setActiveDoc,
      sheet,
      openSpine: () => setSheet({ kind: 'spine' }),
      openTimer: () => setSheet({ kind: 'timer' }),
      openDrawer: () => setSheet({ kind: 'drawer' }),
      openMarginItem: (itemId: string) =>
        setSheet({ kind: 'margin-item', itemId }),
      openMargin: () => setSheet({ kind: 'margin' }),
      openNote: () => setSheet({ kind: 'note' }),
      closeSheet: () => setSheet(null),
      primaryAction,
      registerPrimaryAction,
      secondaryActions,
      registerSecondaryAction,
    }),
    [
      activeDoc,
      primaryAction,
      registerPrimaryAction,
      registerSecondaryAction,
      secondaryActions,
      sheet,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Surface-side: publish the active section or Room's one mobile forward act.
 * Higher-priority lifecycle actions override quiet document fallbacks. */
export function useMobilePrimaryAction(
  action: MobilePrimaryAction | null,
  options: { priority?: number } = {},
) {
  const { registerPrimaryAction } = useMobileShell();
  const owner = useRef(Symbol('mobile-primary-action'));
  const latest = useRef(action);
  latest.current = action;
  const priority = options.priority ?? 0;

  const press = useCallback(() => {
    const current = latest.current;
    if (current?.target.kind === 'press') current.target.onPress();
  }, []);
  const selected = useCallback(() => {
    latest.current?.onSelected?.();
  }, []);

  const actionKey = action?.actionKey ?? null;
  const surfaceKey = action?.surfaceKey ?? null;
  const regionKey = action?.regionKey ?? null;
  const label = action?.label ?? null;
  const disabled = action?.disabled ?? false;
  const loading = action?.loading ?? false;
  const targetKind = action?.target.kind ?? null;
  const href = action?.target.kind === 'href' ? action.target.href : null;

  useEffect(() => {
    const ownerId = owner.current;
    const current = latest.current;
    const normalized: MobilePrimaryAction | null = current
      ? {
          ...current,
          onSelected: selected,
          target:
            current.target.kind === 'href'
              ? { kind: 'href', href: current.target.href }
              : { kind: 'press', onPress: press },
        }
      : null;
    registerPrimaryAction(ownerId, normalized, priority);
    return () => registerPrimaryAction(ownerId, null, priority);
  }, [
    actionKey,
    disabled,
    href,
    label,
    loading,
    press,
    selected,
    priority,
    regionKey,
    registerPrimaryAction,
    surfaceKey,
    targetKind,
  ]);
}

/** Surface-side: publish a quiet mobile act into the existing More shelf. */
export function useMobileSecondaryAction(action: MobileSecondaryAction | null) {
  const { registerSecondaryAction } = useMobileShell();
  const owner = useRef(Symbol('mobile-secondary-action'));
  const latest = useRef(action);
  latest.current = action;

  const press = useCallback(() => {
    latest.current?.onPress();
  }, []);

  const actionKey = action?.actionKey ?? null;
  const label = action?.label ?? null;
  const disabled = action?.disabled ?? false;
  const loading = action?.loading ?? false;

  useEffect(() => {
    const ownerId = owner.current;
    const current = latest.current;
    const normalized = current ? { ...current, onPress: press } : null;
    registerSecondaryAction(ownerId, normalized);
    return () => registerSecondaryAction(ownerId, null);
  }, [actionKey, disabled, label, loading, press, registerSecondaryAction]);
}

/** Page-side: publish the held document to the shell while mounted, and clear
 *  it on unmount so the bar reverts to its Desk state. */
export function useMobileActiveDoc(doc: MobileActiveDoc | null) {
  const { setActiveDoc } = useMobileShell();
  const key = doc?.projectId ?? doc?.proposalId ?? null;
  // Re-publish when the engagement or its sections change (sections drive the
  // bar's section label + the spine sheet's section list).
  const sectionsSig = [
    doc?.sections.map((s) => `${s.key}:${s.state}`).join('|') ?? '',
    doc?.rooms?.map((r) => r.id).join('|') ?? '',
  ].join('//');
  // W2 — the reading stop and the ladder's values change while the engagement
  // and its sections stand still, and they are what the bar's `AT <STOP>` line
  // and the sections sheet print. Without them in the signature the published
  // document is the one from the first paint for the life of the document.
  const stateSig = [
    doc?.readingIndex ?? '',
    Object.entries(doc?.ladderValues ?? {})
      .map(([stop, value]) => `${stop}=${value ?? ''}`)
      .join('|'),
    doc?.clientCopy ? 'copy' : '',
    doc?.marginCount ?? '',
  ].join('//');
  useEffect(() => {
    setActiveDoc(doc);
    return () => setActiveDoc(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, sectionsSig, stateSig, setActiveDoc]);
}
