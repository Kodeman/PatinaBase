import { useEffect, useMemo, useState } from "react";
import type React from "react";
import "./App.css";

type Proposal = {
  id: "material" | "editorial" | "motion";
  number: string;
  name: string;
  short: string;
  accent: string;
};

const proposals: Proposal[] = [
  {
    id: "material",
    number: "01",
    name: "Material Register",
    short: "Tactile depth",
    accent: "#C6785E",
  },
  {
    id: "editorial",
    number: "02",
    name: "Maker’s Ledger",
    short: "Editorial provenance",
    accent: "#536C76",
  },
  {
    id: "motion",
    number: "03",
    name: "The Handled Desk",
    short: "Purposeful response",
    accent: "#7B825B",
  },
];

const slides = [
  "Opening",
  "The two-second read",
  "Why it feels flat",
  "Polish principles",
  "Material Register",
  "Material Register details",
  "Maker’s Ledger",
  "Maker’s Ledger details",
  "The Handled Desk",
  "The Handled Desk details",
  "Recommendation",
  "90-day rollout",
];

function StrataMark({ accent = "#C4A57B" }: { accent?: string }) {
  return (
    <span
      className="strata"
      aria-hidden="true"
      style={{ "--mark": accent } as React.CSSProperties}
    >
      <i />
      <i />
      <i />
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="label">{children}</span>;
}

function Metric({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{children}</span>
    </div>
  );
}

function DeckChrome({
  index,
  setIndex,
}: {
  index: number;
  setIndex: (value: number) => void;
}) {
  return (
    <>
      <aside className="deck-rail" aria-label="Presentation navigation">
        <button
          className="wordmark"
          onClick={() => setIndex(0)}
          aria-label="Return to opening slide"
        >
          <span className="mark">N</span>
          <span>PATINA</span>
        </button>
        <div className="rail-rule" />
        <span className="rail-caption">UI POLISH REVIEW · 2026</span>
        <nav className="rail-nav">
          {proposals.map((proposal, proposalIndex) => {
            const target = [4, 6, 8][proposalIndex];
            const active = index === target || index === target + 1;
            return (
              <button
                key={proposal.id}
                className={active ? "active" : ""}
                aria-current={active ? "step" : undefined}
                onClick={() => setIndex(target)}
                style={{ "--proposal": proposal.accent } as React.CSSProperties}
              >
                <span className={`swatch swatch-${proposal.id}`} />
                <span>
                  <b>{proposal.number}</b>
                  {proposal.name}
                </span>
              </button>
            );
          })}
        </nav>
        <div className="rail-foot">
          <span>
            {String(index + 1).padStart(2, "0")} / {slides.length}
          </span>
          <span>{slides[index]}</span>
        </div>
      </aside>
      <div className="deck-controls">
        <button
          onClick={() => setIndex(Math.max(0, index - 1))}
          disabled={index === 0}
          aria-label="Previous slide"
        >
          ←
        </button>
        <div className="progress">
          <i style={{ width: `${((index + 1) / slides.length) * 100}%` }} />
        </div>
        <button
          onClick={() => setIndex(Math.min(slides.length - 1, index + 1))}
          disabled={index === slides.length - 1}
          aria-label="Next slide"
        >
          →
        </button>
      </div>
    </>
  );
}

function CurrentDesk() {
  return (
    <figure className="current-desk">
      <div
        className="current-shell"
        role="img"
        aria-label="Structural reconstruction of the current Patina Desk: projects grouped by stage in dense one-line rows"
      >
        <div className="current-top">
          <span>PATINA / DESK</span>
          <span>LEAH HARTWELL</span>
        </div>
        <div className="current-body">
          <Label>Every job · 5 live · 2 overdue</Label>
          <p className="overdue-summary">Whitfield and Aspen are overdue.</p>
          <div className="current-group">
            <b>PROPOSAL · 1</b>
            <div>
              <i className="roster-mark quiet" />
              <strong>Olsen Lake House</strong>
              <span>Sent 5 days ago · opened three times</span>
              <em>Follow up →</em>
            </div>
          </div>
          <div className="current-group">
            <b>PROJECT · 2</b>
            <div>
              <i className="roster-mark urgent" />
              <strong>Whitfield Residence</strong>
              <span>
                Procurement · Week 11 of 22
                <br />
                <small>Overdue 3 days — rug decision</small>
              </span>
              <em>Review decisions →</em>
            </div>
            <div>
              <i className="roster-mark quiet" />
              <strong>Chen Residence</strong>
              <span>Install in 9 days</span>
              <em>Open the job →</em>
            </div>
          </div>
          <div className="current-group">
            <b>INSTALL · 2</b>
            <div>
              <i className="roster-mark urgent" />
              <strong>Aspen Loft Refresh</strong>
              <span>
                Install readiness
                <br />
                <small>Overdue 1 day — confirm delivery</small>
              </span>
              <em>Review install →</em>
            </div>
            <div>
              <i className="roster-mark" />
              <strong>Ellsworth Residence</strong>
              <span>On site next week</span>
              <em>Open the job →</em>
            </div>
          </div>
        </div>
      </div>
      <figcaption>
        <Label>Current structure · live code, Aug 28</Label>
        <span>Dense roster, clear stages, nearly uniform depth.</span>
      </figcaption>
    </figure>
  );
}

function MaterialMockup() {
  return (
    <div
      className="portal-mock material-mock"
      aria-label="Material Register proposal mockup"
    >
      <div className="mock-top">
        <span className="mini-brand">
          <b>N</b> PATINA / DESK
        </span>
        <span>EVERY JOB · 5 LIVE · 2 OVERDUE</span>
        <span>LEAH HARTWELL</span>
      </div>
      <div className="mock-body">
        <div className="mock-head">
          <div>
            <Label>Friday · August 28</Label>
            <h3>
              Good morning, <em>Leah</em>
            </h3>
            <p>Two of five live jobs are overdue.</p>
          </div>
          <span className="mock-action">＋ Capture a lead</span>
        </div>
        <div className="register-layout">
          <div className="register-roster">
            <section className="register-group proposal-group">
              <div className="register-binding" />
              <header>
                <span>PROPOSAL</span>
                <b>1</b>
              </header>
              <div className="register-row">
                <strong>Olsen Lake House</strong>
                <span>Sent 5 days ago · opened three times</span>
                <em>Follow up →</em>
              </div>
            </section>
            <section className="register-group project-group">
              <div className="register-binding" />
              <header>
                <span>PROJECT</span>
                <b>2</b>
              </header>
              <div className="register-row featured">
                <div className="material-dots">
                  <i className="linen" />
                  <i className="oak" />
                  <i className="stone" />
                </div>
                <strong>Whitfield Residence</strong>
                <span>
                  Procurement · Week 11
                  <br />
                  <small>Overdue 3 days — rug decision</small>
                </span>
                <em>Review decisions →</em>
              </div>
              <div className="register-row">
                <strong>Chen Residence</strong>
                <span>Install in 9 days</span>
                <em>Open the job →</em>
              </div>
            </section>
            <section className="register-group install-group">
              <div className="register-binding" />
              <header>
                <span>INSTALL</span>
                <b>2</b>
              </header>
              <div className="register-row">
                <strong>Aspen Loft Refresh</strong>
                <span>Overdue 1 day — confirm delivery</span>
                <em>Review install →</em>
              </div>
              <div className="register-row">
                <strong>Ellsworth Residence</strong>
                <span>On site next week</span>
                <em>Open the job →</em>
              </div>
            </section>
          </div>
          <aside className="studio-index">
            <Label>The Studio</Label>
            <strong>Contents</strong>
            <div>
              <b>ROOMS</b>
              <span>Library · pieces and makers</span>
              <span>People · clients, makers, trades</span>
            </div>
            <div>
              <b>LEDGERS</b>
              <span>Orders · POs and receiving</span>
              <span>Accounts · invoices and earnings</span>
            </div>
            <div>
              <b>BEGIN</b>
              <span>— Capture a lead</span>
              <span>— Open a project</span>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function EditorialMockup() {
  return (
    <div
      className="portal-mock editorial-mock"
      aria-label="Maker’s Ledger proposal mockup"
    >
      <div className="editorial-spine">
        <span>← PUT DOWN</span>
        <StrataMark accent="#536C76" />
        <b>
          ELLSWORTH
          <br />
          RESIDENCE
        </b>
        <small>PROJECT · ACTIVE</small>
        <ol>
          <li>Brief</li>
          <li>Direction</li>
          <li className="on">Project</li>
          <li>Install</li>
        </ol>
      </div>
      <div className="editorial-page">
        <header>
          <Label>Project book · 24–017</Label>
          <h3>Ellsworth Residence</h3>
          <p className="deckline">
            Living room · Made with Middlewest Workshop &amp; Loomis Mill
          </p>
        </header>
        <div className="story-band">
          <div
            className="story-image"
            aria-label="Image placement specimen for product photography"
          >
            <span>IMAGE PLACEMENT SPECIMEN</span>
            <i className="chair-back" />
            <i className="chair-seat" />
            <i className="chair-leg leg-a" />
            <i className="chair-leg leg-b" />
          </div>
          <div className="story-copy">
            <Label>Piece in hand</Label>
            <h4>Halsted lounge chair · ×2</h4>
            <p>
              Walnut · flax linen · standard fill. Production is underway in St.
              Paul.
            </p>
            <span className="mock-action">View trail in unfold →</span>
          </div>
        </div>
        <div className="ledger-grid">
          <section>
            <Label>Living room · 6 selections</Label>
            <div className="ledger-row">
              <b>Window bench linen</b>
              <span>Client decision · due today</span>
              <strong>OPEN</strong>
            </div>
            <div className="ledger-row">
              <b>Halsted lounge chair ×2</b>
              <span>Middlewest Workshop · in production</span>
              <strong>JUL 17</strong>
            </div>
          </section>
          <aside>
            <Label>Provenance</Label>
            <p>
              <b>WALNUT</b>
              <span>Kiln-dried in Wisconsin</span>
            </p>
            <p>
              <b>LINEN</b>
              <span>Belgian flax · sample 04</span>
            </p>
            <p>
              <b>MAKER</b>
              <span>Middlewest Workshop · St. Paul</span>
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function MotionMockup({ active }: { active: boolean }) {
  return (
    <div
      className={`portal-mock motion-mock ${active ? "is-active" : ""}`}
      aria-label="Handled Desk proposal mockup"
    >
      <div className="motion-bar">
        <span className="mini-brand">
          <b>N</b> PATINA / DESK
        </span>
        <span>⌘K FIND ANYTHING</span>
        <span>LEAH HARTWELL</span>
      </div>
      <div className="motion-canvas">
        <div className="motion-heading">
          <div>
            <Label>Every job · 5 live · 2 overdue</Label>
            <h3>Today’s work, already in order.</h3>
          </div>
          <span className="motion-note">Hover or focus the lead row</span>
        </div>
        <div
          className="motion-roster"
          tabIndex={0}
          role="group"
          aria-label="Focus to preview the lead-row reveal"
        >
          <section>
            <header>
              <span>PROPOSAL</span>
              <b>1</b>
            </header>
            <article className="motion-row">
              <span className="row-mark quiet-mark" />
              <strong>Olsen Lake House</strong>
              <span>Sent 5 days ago · opened three times</span>
              <em>Follow up →</em>
            </article>
          </section>
          <section>
            <header>
              <span>PROJECT</span>
              <b>2</b>
            </header>
            <article className="motion-row primary-row">
              <i className="focus-wash" />
              <span className="row-mark urgent-mark" />
              <strong>Whitfield Residence</strong>
              <span>
                Procurement · Week 11
                <br />
                <small>Overdue 3 days — rug decision</small>
              </span>
              <em>Review decisions →</em>
              <div className="row-reveal">
                <small>2 options · both in stock</small>
                <b>Open the job →</b>
              </div>
            </article>
            <article className="motion-row">
              <span className="row-mark quiet-mark" />
              <strong>Chen Residence</strong>
              <span>Install in 9 days</span>
              <em>Open the job →</em>
            </article>
          </section>
          <section>
            <header>
              <span>INSTALL</span>
              <b>2</b>
            </header>
            <article className="motion-row">
              <span className="row-mark urgent-mark" />
              <strong>Aspen Loft Refresh</strong>
              <span>Overdue 1 day — confirm delivery</span>
              <em>Review install →</em>
            </article>
            <article className="motion-row">
              <span className="row-mark" />
              <strong>Ellsworth Residence</strong>
              <span>On site next week</span>
              <em>Open the job →</em>
            </article>
          </section>
        </div>
        <div className="motion-trace">
          <span>Focus travels</span>
          <i />
          <b>context</b>
          <i />
          <b>action</b>
          <i />
          <b>confirmation</b>
        </div>
      </div>
    </div>
  );
}

function ProposalHeader({
  proposal,
  verdict,
}: {
  proposal: Proposal;
  verdict: string;
}) {
  return (
    <header
      className="proposal-head"
      style={{ "--proposal": proposal.accent } as React.CSSProperties}
    >
      <span className={`big-swatch swatch-${proposal.id}`} />
      <div>
        <Label>
          Proposal {proposal.number} · {proposal.short}
        </Label>
        <h2>{proposal.name}</h2>
      </div>
      <p>{verdict}</p>
    </header>
  );
}

function Slide({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`slide ${className}`}>{children}</section>;
}

function App() {
  const [index, setIndex] = useState(0);
  const [motionActive, setMotionActive] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowRight", "PageDown"].includes(event.key)) {
        event.preventDefault();
        setIndex((value) => Math.min(slides.length - 1, value + 1));
      }
      if (["ArrowLeft", "PageUp"].includes(event.key)) {
        event.preventDefault();
        setIndex((value) => Math.max(0, value - 1));
      }
      if (event.key === "Home") {
        event.preventDefault();
        setIndex(0);
      }
      if (event.key === "End") {
        event.preventDefault();
        setIndex(slides.length - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const proposal = useMemo(
    () =>
      proposals.find((item) => {
        const i = proposals.indexOf(item);
        return index >= [4, 6, 8][i] && index <= [5, 7, 9][i];
      }),
    [index],
  );

  return (
    <div
      className="deck"
      style={
        {
          "--active-proposal": proposal?.accent ?? "#C4A57B",
        } as React.CSSProperties
      }
    >
      <DeckChrome index={index} setIndex={setIndex} />
      <p className="sr-only" aria-live="polite">
        Slide {index + 1} of {slides.length}: {slides[index]}
      </p>
      <main className="stage">
        <div className="slide-frame" key={index}>
          {index === 0 && (
            <Slide className="cover-slide">
              <div className="cover-copy">
                <Label>Designer portal · UI polish review</Label>
                <h1>
                  Give the work
                  <br />
                  <em>something to hold.</em>
                </h1>
                <p>
                  Three ways to add depth, excitement, and engagement without
                  turning Patina into a dashboard theme.
                </p>
                <div className="cover-meta">
                  <span>12 slides</span>
                  <span>3 proposals</span>
                  <span>1 recommended blend</span>
                </div>
              </div>
              <div className="cover-object" aria-hidden="true">
                <div className="sample sample-3">
                  <span>THE HANDLED DESK</span>
                </div>
                <div className="sample sample-2">
                  <span>MAKER’S LEDGER</span>
                </div>
                <div className="sample sample-1">
                  <StrataMark accent="#C6785E" />
                  <span>MATERIAL REGISTER</span>
                  <strong>Where time adds value.</strong>
                </div>
              </div>
              <footer>Prepared for the Patina team · August 28, 2026</footer>
            </Slide>
          )}

          {index === 1 && (
            <Slide className="audit-slide">
              <div className="split-title">
                <div>
                  <Label>The two-second read</Label>
                  <h2>
                    Quiet, credible—
                    <br />
                    and visually even.
                  </h2>
                </div>
                <p>
                  The portal already feels specific to Patina. The complaint is
                  not “generic.” It is that nearly every region speaks at the
                  same volume.
                </p>
              </div>
              <div className="audit-grid">
                <CurrentDesk />
                <div className="audit-notes">
                  <div>
                    <span>WORKING</span>
                    <h3>A strong world</h3>
                    <p>
                      Paper, the staged roster, workshop language, and
                      restrained Midwest warmth are coherent.
                    </p>
                  </div>
                  <div>
                    <span>WORKING</span>
                    <h3>Real hierarchy in words</h3>
                    <p>
                      Lifecycle headings, overdue sentences, red-letter marks,
                      and next acts map to genuine work states.
                    </p>
                  </div>
                  <div className="tension">
                    <span>TENSION</span>
                    <h3>Low visual modulation</h3>
                    <p>
                      Cream ground + hairlines + small mono labels repeat from
                      header to foot. Urgency, progress, and provenance do not
                      always feel materially different.
                    </p>
                  </div>
                </div>
              </div>
            </Slide>
          )}

          {index === 2 && (
            <Slide className="flat-slide">
              <div className="split-title">
                <div>
                  <Label>Diagnosis</Label>
                  <h2>
                    Flatness is a<br />
                    systems effect.
                  </h2>
                </div>
                <p>
                  No single component is the culprit. Four restrained choices
                  compound across long screens.
                </p>
              </div>
              <div className="cause-grid">
                <article>
                  <span className="cause-number">01</span>
                  <h3>One dominant plane</h3>
                  <p>
                    Off-white paper and pale roster sheets are close in value,
                    so spatial layers merge at a glance.
                  </p>
                  <div className="tone-demo">
                    <i />
                    <i />
                    <i />
                  </div>
                </article>
                <article>
                  <span className="cause-number">02</span>
                  <h3>Hairlines carry too much</h3>
                  <p>
                    Rules separate navigation, status, content, and actions—but
                    rarely change weight or material.
                  </p>
                  <div className="line-demo">
                    <i />
                    <i />
                    <i />
                  </div>
                </article>
                <article>
                  <span className="cause-number">03</span>
                  <h3>Signals stay typographic</h3>
                  <p>
                    Urgency and progress are often encoded in 9–12px labels,
                    asking users to read before they can feel priority.
                  </p>
                  <div className="type-demo">
                    <b>DECISION DUE</b>
                    <b>IN PRODUCTION</b>
                    <b>SIGNED</b>
                  </div>
                </article>
                <article>
                  <span className="cause-number">04</span>
                  <h3>Response is deliberately rare</h3>
                  <p>
                    The current doctrine limits ambient motion and shadows. The
                    UI is calm, but actions can feel less alive.
                  </p>
                  <div className="motion-demo">
                    <i />
                    <span>270ms</span>
                    <i />
                  </div>
                </article>
              </div>
              <p className="evidence-note">
                <StrataMark />
                Evidence: global paper tokens, D4’s no-shadow rule, R15’s single
                ambient “breath,” and the already-sanctioned folio pickup.
              </p>
            </Slide>
          )}

          {index === 3 && (
            <Slide className="principles-slide">
              <div className="split-title">
                <div>
                  <Label>Design brief</Label>
                  <h2>
                    More feeling.
                    <br />
                    Same discipline.
                  </h2>
                </div>
                <p>
                  The proposals spend boldness in different places. Each keeps
                  the product fast, legible, and recognizably Patina.
                </p>
              </div>
              <div className="principle-list">
                <article>
                  <span>01</span>
                  <h3>Depth must mean something.</h3>
                  <p>
                    Raised = active or in hand. Recessed = context. Stacked =
                    history or supporting material.
                  </p>
                </article>
                <article>
                  <span>02</span>
                  <h3>Color belongs to work state.</h3>
                  <p>
                    Clay calls attention; sage settles; dusty blue carries
                    movement; golden hour marks a choice.
                  </p>
                </article>
                <article>
                  <span>03</span>
                  <h3>Motion follows the hand.</h3>
                  <p>
                    No decorative drift. Motion confirms focus, opens context,
                    and makes state changes understandable.
                  </p>
                </article>
                <article>
                  <span>04</span>
                  <h3>Furniture earns the image.</h3>
                  <p>
                    Use materials, maker provenance, and project imagery where
                    they improve recognition—not as wallpaper.
                  </p>
                </article>
              </div>
              <div className="constraint-bar">
                <span>KEEP</span>
                <b>Document vocabulary</b>
                <b>Accessible contrast</b>
                <b>Reduced motion</b>
                <b>Dense desktop work</b>
                <b>No invented features</b>
              </div>
            </Slide>
          )}

          {index === 4 && (
            <Slide className="proposal-slide material-slide">
              <ProposalHeader
                proposal={proposals[0]}
                verdict="Recommended foundation · Give each live stage a tactile register without turning rows into cards."
              />
              <MaterialMockup />
              <div className="proposal-caption">
                <p>
                  <b>Signature move:</b> stage-group sheet edges, edge-painted
                  bindings, and one material cue on the priority row.
                </p>
                <p>
                  <b>Why it works:</b> the live one-line roster stays dense
                  while paper, linen, oak, and stone create meaningful depth.
                </p>
              </div>
            </Slide>
          )}

          {index === 5 && (
            <Slide className="detail-slide material-detail">
              <ProposalHeader
                proposal={proposals[0]}
                verdict="A controlled expansion of the live roster: sheet edges, bindings, and one earned material cue."
              />
              <div className="detail-grid">
                <section className="token-board">
                  <Label>Material palette</Label>
                  {[
                    ["#F8F3EA", "Workshop paper"],
                    ["#D8CCB9", "Raw linen"],
                    ["#8B684D", "Oak ink"],
                    ["#9C5340", "Fired clay"],
                    ["#4E5B3A", "Settled sage"],
                  ].map(([c, n]) => (
                    <div className="token-row" key={n}>
                      <i style={{ background: c }} />
                      <span>{n}</span>
                      <b>{c}</b>
                    </div>
                  ))}
                </section>
                <section className="before-after">
                  <Label>Component example</Label>
                  <div className="ba-row">
                    <span>BEFORE</span>
                    <div className="flat-card">
                      <b>Aspen Loft Refresh</b>
                      <p>1 decision overdue</p>
                    </div>
                  </div>
                  <div className="ba-row">
                    <span>AFTER</span>
                    <div className="layered-card">
                      <i />
                      <i />
                      <b>Aspen Loft Refresh</b>
                      <p>
                        <em className="linen" /> Primary bedroom · 12 pieces
                      </p>
                    </div>
                  </div>
                </section>
                <section className="proposal-rules">
                  <Label>System rules</Label>
                  <ul>
                    <li>One emphasized row per viewport.</li>
                    <li>Material cues only when backed by project data.</li>
                    <li>Edges, tone, and 1px offsets do most of the work.</li>
                    <li>Preserve D4: no broad shadow needed.</li>
                  </ul>
                </section>
                <section className="effort-card">
                  <Label>Adoption</Label>
                  <Metric value="M+">Effort</Metric>
                  <Metric value="4–6">Core components</Metric>
                  <Metric value="2">Pilot surfaces</Metric>
                  <p>
                    Start with Desk stage groups and Studio tray. No schema
                    change; add a project-summary read and a graceful
                    missing-material fallback.
                  </p>
                </section>
              </div>
            </Slide>
          )}

          {index === 6 && (
            <Slide className="proposal-slide editorial-slide">
              <ProposalHeader
                proposal={proposals[1]}
                verdict="Highest brand expression · Let the piece in hand carry maker, material, and movement."
              />
              <EditorialMockup />
              <div className="proposal-caption">
                <p>
                  <b>Signature move:</b> only the unfolded FF&amp;E line becomes
                  an image-backed artifact plate; folded rows stay dense.
                </p>
                <p>
                  <b>Why it works:</b> existing product-image and brand joins
                  can support provenance without a schema change; missing
                  imagery needs a deliberate fallback.
                </p>
              </div>
            </Slide>
          )}

          {index === 7 && (
            <Slide className="detail-slide editorial-detail">
              <ProposalHeader
                proposal={proposals[1]}
                verdict="Spend visual energy only on the piece currently in hand."
              />
              <div className="detail-grid">
                <section className="token-board">
                  <Label>Editorial palette</Label>
                  {[
                    ["#FCFAF6", "Paper"],
                    ["#F1EBE2", "Vellum"],
                    ["#2C2926", "Charcoal"],
                    ["#8B7355", "Aged oak"],
                    ["#5F6B57", "Sage ink"],
                  ].map(([c, n]) => (
                    <div className="token-row" key={n}>
                      <i style={{ background: c }} />
                      <span>{n}</span>
                      <b>{c}</b>
                    </div>
                  ))}
                </section>
                <section className="before-after">
                  <Label>Component example</Label>
                  <div className="ba-row">
                    <span>BEFORE</span>
                    <div className="status-line">
                      <b>Halsted lounge chair ×2</b>
                      <p>Production · $3,620</p>
                    </div>
                  </div>
                  <div className="ba-row">
                    <span>AFTER</span>
                    <div className="chapter-line">
                      <b>Halsted lounge chair ×2</b>
                      <p>Middlewest Workshop · walnut · flax linen</p>
                      <i>IN HAND</i>
                    </div>
                  </div>
                </section>
                <section className="proposal-rules">
                  <Label>System rules</Label>
                  <ul>
                    <li>Imagery appears only after a line unfolds.</li>
                    <li>Headlines state observable truth.</li>
                    <li>Provenance is never inferred; absence is named.</li>
                    <li>Internal source and trade cost remain studio-only.</li>
                  </ul>
                </section>
                <section className="effort-card">
                  <Label>Adoption</Label>
                  <Metric value="M">Effort</Metric>
                  <Metric value="3">Core components</Metric>
                  <Metric value="0">Schema changes</Metric>
                  <p>
                    Pilot in Pieces: FF&amp;E row, line unfold, and procurement
                    trail.
                  </p>
                </section>
              </div>
            </Slide>
          )}

          {index === 8 && (
            <Slide className="proposal-slide motion-slide">
              <ProposalHeader
                proposal={proposals[2]}
                verdict="Highest engagement lift · Make the live roster visibly answer the designer’s hand."
              />
              <div
                onMouseEnter={() => setMotionActive(true)}
                onMouseLeave={() => setMotionActive(false)}
                onFocus={() => setMotionActive(true)}
                onBlur={() => setMotionActive(false)}
              >
                <MotionMockup active={motionActive} />
              </div>
              <div className="proposal-caption">
                <p>
                  <b>Signature move:</b> a focus runway expands one roster row
                  with context and the next act, then carries its title into the
                  document.
                </p>
                <p>
                  <b>Try it:</b> hover or keyboard-focus the mockup.
                  Reduced-motion preferences receive the same information
                  instantly.
                </p>
              </div>
            </Slide>
          )}

          {index === 9 && (
            <Slide className="detail-slide motion-detail">
              <ProposalHeader
                proposal={proposals[2]}
                verdict="A proposed exception to the still-Desk doctrine: test whether response clarifies state before systemizing it."
              />
              <div className="detail-grid">
                <section className="motion-score">
                  <Label>Motion score</Label>
                  <div>
                    <b>70ms</b>
                    <span>Press in</span>
                    <i />
                  </div>
                  <div>
                    <b>140ms</b>
                    <span>Focus wash</span>
                    <i />
                  </div>
                  <div>
                    <b>240ms</b>
                    <span>Unfold</span>
                    <i />
                  </div>
                  <div>
                    <b>270ms</b>
                    <span>Pickup / settle</span>
                    <i />
                  </div>
                  <p>
                    Easing: editorial <code>cubic-bezier(.22,1,.36,1)</code>
                  </p>
                </section>
                <section className="before-after">
                  <Label>Interaction example</Label>
                  <div className="focus-sequence">
                    <span>REST</span>
                    <i>Job row</i>
                    <b>→</b>
                    <span>FOCUS</span>
                    <i className="focused">Context + act</i>
                    <b>→</b>
                    <span>OPEN</span>
                    <i className="settled">Letterhead</i>
                  </div>
                </section>
                <section className="proposal-rules">
                  <Label>System rules</Label>
                  <ul>
                    <li>
                      Record a deliberate exception to R15 before moving Desk
                      rows.
                    </li>
                    <li>
                      Motion starts only from input or a true state change.
                    </li>
                    <li>Keyboard focus receives the same reveal as hover.</li>
                    <li>
                      <code>prefers-reduced-motion</code> gets instant state
                      swaps.
                    </li>
                  </ul>
                </section>
                <section className="effort-card">
                  <Label>Adoption</Label>
                  <Metric value="M">Effort</Metric>
                  <Metric value="3">Pilot primitives</Metric>
                  <Metric value="0">Ambient loops</Metric>
                  <p>
                    Pilot only focus wash, disclosure, and document pickup.
                    Scale after usability evidence and a motion-doctrine ruling.
                  </p>
                </section>
              </div>
            </Slide>
          )}

          {index === 10 && (
            <Slide className="recommend-slide">
              <div className="split-title">
                <div>
                  <Label>Recommendation</Label>
                  <h2>
                    Build the material.
                    <br />
                    Borrow the motion.
                  </h2>
                </div>
                <p>
                  Proposal 01 is the clearest first move. Add Proposal 03’s
                  response layer, then use Proposal 02 selectively inside
                  Pieces.
                </p>
              </div>
              <div
                className="score-table"
                role="table"
                aria-label="Proposal comparison"
              >
                <div className="score-head" role="row">
                  {[
                    "Direction",
                    "Brand fit",
                    "Excitement",
                    "Workflow safety",
                    "Effort",
                    "Verdict",
                  ].map((heading) => (
                    <span role="columnheader" key={heading}>
                      {heading}
                    </span>
                  ))}
                </div>
                {[
                  [
                    "material",
                    "01 · Material Register",
                    "●●●●●",
                    "●●●●○",
                    "●●●●●",
                    "Medium+",
                    "FOUNDATION",
                  ],
                  [
                    "editorial",
                    "02 · Maker’s Ledger",
                    "●●●●●",
                    "●●●●●",
                    "●●●●○",
                    "Medium",
                    "SELECTIVE",
                  ],
                  [
                    "motion",
                    "03 · Handled Desk",
                    "●●●●○",
                    "●●●●●",
                    "●●●●○",
                    "Medium",
                    "LAYER IN",
                  ],
                ].map((row, rowIndex) => (
                  <div
                    role="row"
                    className={rowIndex === 0 ? "winner" : ""}
                    key={row[0]}
                  >
                    <b role="rowheader">
                      <i className={`swatch swatch-${row[0]}`} />
                      {row[1]}
                    </b>
                    {row.slice(2, 6).map((cell) => (
                      <span role="cell" key={cell}>
                        {cell}
                      </span>
                    ))}
                    <strong role="cell">{row[6]}</strong>
                  </div>
                ))}
              </div>
              <div className="blend-diagram">
                <div>
                  <span>FOUNDATION</span>
                  <b>Material Register</b>
                  <p>Tone · edges · tactile hierarchy</p>
                </div>
                <i>＋</i>
                <div>
                  <span>RESPONSE</span>
                  <b>The Handled Desk</b>
                  <p>Focus · reveal · pickup</p>
                </div>
                <i>＋</i>
                <div>
                  <span>PROVENANCE</span>
                  <b>Maker’s Ledger</b>
                  <p>Only the piece in hand</p>
                </div>
              </div>
            </Slide>
          )}

          {index === 11 && (
            <Slide className="rollout-slide">
              <div className="split-title">
                <div>
                  <Label>90-day polish program</Label>
                  <h2>
                    Prove depth
                    <br />
                    before scaling it.
                  </h2>
                </div>
                <p>
                  A contained pilot can measure whether polish improves
                  comprehension—not only taste.
                </p>
              </div>
              <div className="timeline">
                <article>
                  <span>WEEKS 1–2</span>
                  <h3>Calibrate</h3>
                  <ul>
                    <li>Prototype Desk stage group + FF&amp;E unfold</li>
                    <li>Lock depth and state-color tokens</li>
                    <li>Test AA contrast and reduced motion</li>
                  </ul>
                  <b>DECISION: edge-only depth system</b>
                </article>
                <article>
                  <span>WEEKS 3–6</span>
                  <h3>Pilot</h3>
                  <ul>
                    <li>Ship behind a feature flag</li>
                    <li>Desk + one rich project document</li>
                    <li>Track time-to-first-action and mis-clicks</li>
                  </ul>
                  <b>DECISION: scale or remove</b>
                </article>
                <article>
                  <span>WEEKS 7–12</span>
                  <h3>Systemize</h3>
                  <ul>
                    <li>Codify 4–6 shared primitives</li>
                    <li>Add motion/accessibility states</li>
                    <li>Extend to ledgers and Rooms selectively</li>
                  </ul>
                  <b>OUTPUT: polish playbook</b>
                </article>
              </div>
              <div className="success-bar">
                <Label>Success looks like</Label>
                <Metric value="Faster">First useful action</Metric>
                <Metric value="Clearer">Priority recall</Metric>
                <Metric value="Higher">Return engagement</Metric>
                <Metric value="No loss">Completion &amp; accessibility</Metric>
              </div>
              <div className="closing">
                <StrataMark accent="#C6785E" />
                <h3>
                  Where time adds value,
                  <br />
                  <em>the interface should show its grain.</em>
                </h3>
                <p>
                  Start with Material Register + three purposeful motion
                  primitives.
                </p>
              </div>
            </Slide>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
