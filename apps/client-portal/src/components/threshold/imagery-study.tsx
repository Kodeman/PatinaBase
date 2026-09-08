"use client";

import { useId, useState } from "react";

const VIEWS = [
  {
    key: "living",
    label: "Living",
    title: "A room to settle into.",
    image: "/design-review/imagery/living.jpg",
    alt: "Generated living-room concept with ivory seating, walnut and olive textiles",
    description:
      "Soft linen, warm timber and a little olive. A quieter backdrop for everyday life.",
  },
  {
    key: "dining",
    label: "Dining",
    title: "Made for gathering.",
    image: "/design-review/imagery/dining.jpg",
    alt: "Generated dining-room concept with a walnut table and upholstered oak chairs",
    description:
      "Sculptural wood, comfortable seating and light that changes through the day.",
  },
  {
    key: "materials",
    label: "Materials",
    title: "The details make it yours.",
    image: "/design-review/imagery/materials.jpg",
    alt: "Generated material-board concept with walnut, linen, olive fabric, stone and bronze",
    description:
      "See grain, weave and finish together before imagining them at room scale.",
  },
] as const;

export function ImageryStudy() {
  const [selected, setSelected] = useState<(typeof VIEWS)[number]>(VIEWS[0]);
  const [brokenImages, setBrokenImages] = useState<string[]>([]);
  const headingId = useId();
  const available = !brokenImages.includes(selected.image);

  return (
    <section
      className="imagery-study"
      aria-labelledby={headingId}
      data-testid="imagery-study"
    >
      <p className="imagery-study-disclosure">
        Design study · Generated imagery, not your actual rooms or selected
        products.
      </p>
      <div className="imagery-study-stage">
        <figure>
          {available ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="imagery-study-main"
              src={selected.image}
              alt={selected.alt}
              width={1536}
              height={1024}
              onError={() =>
                setBrokenImages((images) => [...images, selected.image])
              }
            />
          ) : (
            <div className="imagery-study-unavailable">
              <p role="status">
                This concept image could not load. Retry it or choose another
                view below.
              </p>
              <button
                type="button"
                onClick={() =>
                  setBrokenImages((images) =>
                    images.filter((image) => image !== selected.image),
                  )
                }
              >
                Retry image
              </button>
            </div>
          )}
          <figcaption>
            Illustrative {selected.label.toLowerCase()} direction. No project
            selections or approvals change here.
          </figcaption>
        </figure>
        <div
          className="imagery-study-copy"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="imagery-study-category">{selected.label} study</span>
          <h3 id={headingId}>{selected.title}</h3>
          <p>{selected.description}</p>
          <div
            className="imagery-study-palette"
            aria-label="Concept palette: walnut, linen, olive and stone"
          >
            <span style={{ background: "#77513a" }} aria-hidden="true" />
            <span style={{ background: "#e4d8c6" }} aria-hidden="true" />
            <span style={{ background: "#62694a" }} aria-hidden="true" />
            <span style={{ background: "#b8b1a2" }} aria-hidden="true" />
          </div>
          <p className="imagery-study-palette-label">
            Walnut · Linen · Olive · Stone
          </p>
        </div>
      </div>
      <div
        className="imagery-study-views"
        role="group"
        aria-label="Choose a concept view"
      >
        {VIEWS.map((view) => (
          <button
            type="button"
            key={view.key}
            aria-pressed={selected.key === view.key}
            onClick={() => setSelected(view)}
          >
            {!brokenImages.includes(view.image) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={view.image}
                alt=""
                width={180}
                height={120}
                loading="lazy"
                onError={() =>
                  setBrokenImages((images) => [...images, view.image])
                }
              />
            )}
            <span>{view.label}</span>
            <span className="imagery-study-current" aria-hidden="true">
              {selected.key === view.key ? "Viewing" : "Explore"}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
