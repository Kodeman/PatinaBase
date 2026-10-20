// Patina Client Portal — components
// Same language as designer portal; warmer, more decisive, fewer lists.
// The client portal is the homeowner's view — calm, reassuring, focused.

// ─────────────────────────────────────────────────────────────
// CLIENT HEADER — sticky top, logo + project switcher + indicators
// ─────────────────────────────────────────────────────────────
function ClientHeader({ activeProject, approvals = 0, messages = 0, lastUpdated = '2 hours ago' }) {
  return (
    <header style={{
      borderBottom: '1px solid var(--border-default)',
      background: 'rgba(250, 247, 242, 0.92)',
      backdropFilter: 'blur(8px)',
      position: 'sticky', top: 0, zIndex: 30,
    }}>
      <div style={{
        maxWidth: 1100, margin: '0 auto',
        padding: '16px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{
            fontFamily: 'var(--font-display)', fontWeight: 500,
            fontSize: '1rem', letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--text-primary)',
          }}>Patina</span>
          {activeProject && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--border-default)' }}>/</span>
              <span className="type-label">{activeProject}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)' }}><path d="M6 9l6 6 6-6"/></svg>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-clay)" strokeWidth="1.5"><path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/></svg>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{approvals}</span>
            <span className="type-meta">approvals</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-clay)" strokeWidth="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{messages}</span>
            <span className="type-meta">messages</span>
          </div>
          <span className="type-meta">Updated {lastUpdated}</span>
        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────
// PROJECT CARD — client-side list row (big progress numeral)
// ─────────────────────────────────────────────────────────────
function ClientProjectRow({ name, location, nextMilestone, approvals, messages, progress }) {
  const [hover, setHover] = React.useState(false);
  return (
    <a onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'block', padding: '1.5rem 0',
        borderBottom: '1px solid var(--border-default)',
        cursor: 'pointer', textDecoration: 'none',
        background: hover ? 'rgba(196,165,123,0.04)' : 'transparent',
        transition: 'background 160ms var(--ease-default)',
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="type-item-name" style={{ margin: 0, color: hover ? 'var(--color-clay)' : 'var(--text-primary)', transition: 'color 160ms' }}>{name}</h2>
          {location && <div className="type-meta" style={{ marginTop: 4 }}>{location}</div>}
          <div style={{ marginTop: 12, height: 2, background: 'var(--border-default)', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--color-clay)', width: `${Math.max(2, progress)}%`, transition: 'width 300ms' }}/>
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
            {nextMilestone && (
              <span className="type-body-small">
                Next: <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500, color: 'var(--text-primary)' }}>{nextMilestone}</span>
              </span>
            )}
            <span className="type-meta">{approvals} {approvals === 1 ? 'approval' : 'approvals'}</span>
            <span className="type-meta">{messages} {messages === 1 ? 'message' : 'messages'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span className="type-data-large" style={{ fontSize: '2.4rem' }}>{Math.round(progress)}</span>
          <span className="type-meta-small">% complete</span>
        </div>
      </div>
    </a>
  );
}

// ─────────────────────────────────────────────────────────────
// DECISION CARD — approval request (the core client interaction)
// ─────────────────────────────────────────────────────────────
function DecisionCard({ kind, title, summary, deadline, options }) {
  return (
    <div style={{ padding: '1.75rem 0', borderBottom: '1px solid var(--border-default)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span className="type-meta">{kind}</span>
        <span className="type-meta" style={{ color: 'var(--color-golden-hour)' }}>Response needed {deadline}</span>
      </div>
      <h3 className="type-item-name" style={{ margin: '0 0 8px' }}>{title}</h3>
      <p className="type-body" style={{ maxWidth: 560, color: 'var(--text-secondary)', margin: '0 0 20px' }}>{summary}</p>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 16, marginBottom: 20 }}>
        {options.map((o, i) => (
          <div key={i} style={{
            border: '1px solid var(--border-default)',
            padding: 14, cursor: 'pointer',
            background: 'var(--bg-surface)',
          }}>
            <div style={{
              aspectRatio: '4 / 3', background: 'var(--color-pearl)',
              marginBottom: 10,
            }}/>
            <div className="type-label">{o.name}</div>
            <div className="type-meta-small" style={{ marginTop: 2 }}>{o.meta}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <Button variant="primary">Approve selection</Button>
        <Button variant="secondary">Request changes</Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BUDGET OVERVIEW — three numbers, one bar, payment list
// ─────────────────────────────────────────────────────────────
function BudgetOverview({ budget, committed, paid, utilization, milestones = [] }) {
  const fmt = (n) => `$${n.toLocaleString()}`;
  return (
    <div>
      <h3 className="type-section-head" style={{ margin: '0 0 24px' }}>Budget Overview</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
        <div style={{ borderBottom: '1px solid var(--border-default)', paddingBottom: 16 }}>
          <div className="type-meta">Total Budget</div>
          <div className="type-data-large" style={{ marginTop: 6 }}>{fmt(budget)}</div>
        </div>
        <div style={{ borderBottom: '1px solid var(--border-default)', paddingBottom: 16 }}>
          <div className="type-meta">Committed</div>
          <div className="type-data-large" style={{ marginTop: 6 }}>{fmt(committed)}</div>
        </div>
        <div style={{ borderBottom: '1px solid var(--border-default)', paddingBottom: 16 }}>
          <div className="type-meta">Paid to Date</div>
          <div className="type-data-large" style={{ marginTop: 6 }}>{fmt(paid)}</div>
        </div>
      </div>
      <div style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="type-meta">Budget utilization</span>
          <span className="type-meta" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{utilization}%</span>
        </div>
        <ProgressBar value={utilization} />
      </div>
      {milestones.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div className="type-meta" style={{ marginBottom: 12 }}>Payment Schedule</div>
          {milestones.map((m, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1fr auto auto',
              gap: 20, padding: '0.9rem 0',
              borderBottom: '1px solid rgba(229,226,221,0.55)',
              alignItems: 'baseline',
            }}>
              <div>
                <div className="type-label">{m.name}</div>
                <div className="type-label-secondary" style={{ marginTop: 2 }}>{m.date}</div>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1rem', color: 'var(--text-primary)' }}>{fmt(m.amount)}</div>
              <span className="type-meta-small" style={{
                color: m.status === 'paid' ? 'var(--color-sage)' : 'var(--text-muted)',
              }}>{m.status === 'paid' ? 'Paid' : 'Upcoming'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ClientHeader, ClientProjectRow, DecisionCard, BudgetOverview });
