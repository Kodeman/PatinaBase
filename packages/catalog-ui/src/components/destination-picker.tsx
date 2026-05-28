'use client';

import * as React from 'react';
import { LayerIcon } from './layer-icon';

/**
 * Destination contract per PRD §5.3. A capture can either land in the
 * designer's personal library or be routed straight into a project room.
 * `roomId` is optional even when `type === 'project-room'` — the picker UI
 * is happy to pick project-only when a project has no rooms defined yet.
 */
export type DestinationPickerValue =
  | { type: 'personal' }
  | { type: 'project-room'; projectId: string; roomId?: string };

export interface DestinationPickerRoom {
  id: string;
  name: string;
}

export interface DestinationPickerProject {
  id: string;
  name: string;
  /** Optional rooms — when omitted the picker selects the project as a whole. */
  rooms?: DestinationPickerRoom[];
}

export interface DestinationPickerProps {
  value: DestinationPickerValue;
  onChange: (next: DestinationPickerValue) => void;
  /**
   * Projects to offer. Recommend top 3–5 most-recently-active, sorted by
   * recency. Caller is responsible for the source and ordering.
   */
  projects?: DestinationPickerProject[];
  /** Renders a loading state when projects aren't ready yet. */
  isLoading?: boolean;
  /** Optional label shown above the trigger. Default "Save to". */
  label?: string;
  className?: string;
  /** Disable interaction (e.g. while a capture is mid-flight). */
  disabled?: boolean;
}

const PERSONAL_LABEL = 'Personal Library';

/**
 * The single source of truth for "where does this capture go?". Replaces the
 * legacy `isPersonalCatalog: boolean` + `selectedProjectId: UUID | null` pair
 * used by the Chrome extension. Used by extension capture, mobile capture,
 * and any in-portal capture surface.
 *
 * Defaults to Personal — every capture should be a 5-second action, and
 * Personal is the path with zero required fields.
 */
export function DestinationPicker({
  value,
  onChange,
  projects = [],
  isLoading = false,
  label = 'Save to',
  className,
  disabled = false,
}: DestinationPickerProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Close on outside click + Escape.
  React.useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const triggerSummary = summarize(value, projects);

  return (
    <div ref={containerRef} className={className} style={{ position: 'relative', width: '100%' }}>
      <label
        className="type-meta-small"
        style={{
          display: 'block',
          marginBottom: 6,
          color: 'var(--text-muted, #8B7355)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </label>

      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled || isLoading}
        onClick={() => setOpen((prev) => !prev)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 3,
          border: '1px solid var(--border-default, #E5E2DD)',
          background: 'var(--bg-surface, #FFFFFF)',
          color: 'var(--text-primary, #2C2926)',
          fontSize: '0.88rem',
          fontFamily: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {value.type === 'personal' ? (
            <LayerIcon layer="personal" size="sm" />
          ) : (
            <FolderGlyph />
          )}
          <span>{isLoading ? 'Loading projects…' : triggerSummary}</span>
        </span>
        <Caret open={open} />
      </button>

      {open && !isLoading && (
        <div
          role="listbox"
          aria-label={label}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 30,
            maxHeight: 320,
            overflowY: 'auto',
            background: 'var(--bg-surface, #FFFFFF)',
            border: '1px solid var(--border-default, #E5E2DD)',
            borderRadius: 6,
            boxShadow: '0 10px 32px rgba(44, 41, 38, 0.12)',
          }}
        >
          <Option
            isActive={value.type === 'personal'}
            onSelect={() => {
              onChange({ type: 'personal' });
              setOpen(false);
            }}
          >
            <LayerIcon layer="personal" size="sm" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: '0.88rem', color: 'var(--text-primary, #2C2926)' }}>
                {PERSONAL_LABEL}
              </span>
              <span
                className="type-meta-small"
                style={{ color: 'var(--text-muted, #8B7355)' }}
              >
                Private to you · no review queue
              </span>
            </div>
          </Option>

          {projects.length > 0 && (
            <SectionHeader>Projects</SectionHeader>
          )}

          {projects.map((project) => {
            const isProjectActive =
              value.type === 'project-room' && value.projectId === project.id;
            const hasRooms = project.rooms && project.rooms.length > 0;

            return (
              <React.Fragment key={project.id}>
                <Option
                  isActive={isProjectActive && !value.roomId}
                  onSelect={() => {
                    onChange({ type: 'project-room', projectId: project.id });
                    if (!hasRooms) setOpen(false);
                  }}
                >
                  <FolderGlyph />
                  <span style={{ fontSize: '0.88rem', color: 'var(--text-primary, #2C2926)' }}>
                    {project.name}
                  </span>
                </Option>

                {hasRooms &&
                  project.rooms!.map((room) => {
                    const isRoomActive =
                      value.type === 'project-room' &&
                      value.projectId === project.id &&
                      value.roomId === room.id;
                    return (
                      <Option
                        key={room.id}
                        isActive={isRoomActive}
                        indent
                        onSelect={() => {
                          onChange({
                            type: 'project-room',
                            projectId: project.id,
                            roomId: room.id,
                          });
                          setOpen(false);
                        }}
                      >
                        <RoomGlyph />
                        <span
                          style={{ fontSize: '0.84rem', color: 'var(--text-body, #5C4A3C)' }}
                        >
                          {room.name}
                        </span>
                      </Option>
                    );
                  })}
              </React.Fragment>
            );
          })}

          {projects.length === 0 && (
            <div
              className="type-meta-small"
              style={{ padding: '10px 14px', color: 'var(--text-muted, #8B7355)' }}
            >
              No active projects. Captures will go to your Personal Library.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function summarize(
  value: DestinationPickerValue,
  projects: DestinationPickerProject[],
): string {
  if (value.type === 'personal') return PERSONAL_LABEL;
  const project = projects.find((p) => p.id === value.projectId);
  if (!project) return 'Select project…';
  if (!value.roomId) return project.name;
  const room = project.rooms?.find((r) => r.id === value.roomId);
  return room ? `${project.name} · ${room.name}` : project.name;
}

function Option({
  children,
  isActive,
  onSelect,
  indent = false,
}: {
  children: React.ReactNode;
  isActive: boolean;
  onSelect: () => void;
  indent?: boolean;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: indent ? '6px 14px 6px 36px' : '8px 14px',
        background: isActive ? 'rgba(196, 165, 123, 0.08)' : 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(event) => {
        if (!isActive) {
          (event.currentTarget as HTMLButtonElement).style.background =
            'rgba(196, 165, 123, 0.06)';
        }
      }}
      onMouseLeave={(event) => {
        (event.currentTarget as HTMLButtonElement).style.background = isActive
          ? 'rgba(196, 165, 123, 0.08)'
          : 'transparent';
      }}
    >
      {children}
    </button>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="type-meta-small"
      style={{
        padding: '8px 14px 4px',
        color: 'var(--text-muted, #8B7355)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        borderTop: '1px solid var(--border-subtle, rgba(229,226,221,0.6))',
        marginTop: 4,
      }}
    >
      {children}
    </div>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transition: 'transform 120ms ease',
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        color: 'var(--text-muted, #8B7355)',
        flexShrink: 0,
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function FolderGlyph() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: 'var(--text-muted, #8B7355)', flexShrink: 0 }}
    >
      <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
    </svg>
  );
}

function RoomGlyph() {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: 'var(--text-muted, #8B7355)', flexShrink: 0 }}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
}
