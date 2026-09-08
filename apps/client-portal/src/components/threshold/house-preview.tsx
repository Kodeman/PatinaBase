"use client";

import { useId, useState } from "react";

import {
  GOODS_JOURNEY_STAGES,
  TRADE_JOURNEY_STAGES,
  journeyStageIndexForStatus,
  tradeJourneyStageIndexForState,
} from "@/components/commercial/journey-stepper";
import { ScoredAction } from "@/components/threshold/instruments/scored-action";
import { moneyInWords } from "@/components/threshold/instruments/standing-sentence";
import type { RoomBandModel } from "@/lib/threshold/derive";
import { ImageryStudy } from "./imagery-study";

export function HousePreview({ bands }: { bands: RoomBandModel[] }) {
  const headingId = useId();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [pieceId, setPieceId] = useState<string | null>(null);
  const [brokenUrls, setBrokenUrls] = useState<string[]>([]);
  const [showStudy, setShowStudy] = useState(true);
  const studyEnabled =
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_PATINA_IMAGE_REVIEW === "1";
  const room =
    bands.find((band) => band.roomId === roomId) ??
    bands.find((band) => band.pieces.some((piece) => piece.imageUrl)) ??
    bands[0];
  if (!room) return null;

  const piece =
    room.pieces.find((selection) => selection.id === pieceId) ??
    room.pieces.find((selection) => selection.imageUrl) ??
    room.pieces[0];
  const imageUrl = piece?.imageUrl;
  const hasImage = !!imageUrl && !brokenUrls.includes(imageUrl);
  const isTrade = piece?.kind === "trade";
  const stage = piece
    ? isTrade
      ? piece.tradeJourney === null
        ? "Scope status unavailable"
        : TRADE_JOURNEY_STAGES[
            tradeJourneyStageIndexForState(piece.tradeJourney)
          ]
      : GOODS_JOURNEY_STAGES[journeyStageIndexForStatus(piece.logisticsStatus)]
    : null;

  return (
    <section
      id="house-imagery"
      className="house-preview"
      aria-labelledby={headingId}
      data-testid="house-preview"
    >
      <div className="house-preview-heading">
        <div>
          <p className="material-eyebrow">Your home, taking shape</p>
          <h2 id={headingId}>Room by room.</h2>
        </div>
        <div
          className="house-room-picker"
          role="group"
          aria-label="Preview a room"
          hidden={studyEnabled && showStudy}
        >
          {bands.map((band) => (
            <button
              key={band.roomId}
              type="button"
              aria-pressed={band.roomId === room.roomId}
              onClick={() => {
                setRoomId(band.roomId);
                setPieceId(null);
              }}
            >
              {band.name}
            </button>
          ))}
        </div>
      </div>

      {studyEnabled && (
        <div
          className="imagery-review-mode"
          role="group"
          aria-label="Image review mode"
        >
          <button
            type="button"
            aria-pressed={showStudy}
            onClick={() => setShowStudy(true)}
          >
            Imagery study
          </button>
          <button
            type="button"
            aria-pressed={!showStudy}
            onClick={() => setShowStudy(false)}
          >
            Your project images
          </button>
          <span>Local design review only</span>
        </div>
      )}

      {studyEnabled && showStudy ? (
        <>
          <nav
            className="imagery-study-room-links"
            aria-label="Go to your project rooms"
          >
            <span>Your project rooms</span>
            {bands.map((band) => (
              <a key={band.roomId} href={`#${band.anchor}`}>
                {band.name}
              </a>
            ))}
          </nav>
          <ImageryStudy />
        </>
      ) : (
        <>
          <div className="house-preview-body" data-has-image={hasImage}>
            <figure className="house-preview-figure">
              <div className="house-preview-image">
                {hasImage ? (
                  // Existing selection imagery may be a product photograph or a render.
                  // Its source does not establish that the piece is installed in this room.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt={piece.name}
                    onError={() => setBrokenUrls((urls) => [...urls, imageUrl])}
                  />
                ) : (
                  <div
                    className="house-preview-placeholder"
                    data-testid="house-preview-placeholder"
                  >
                    <p>
                      {piece
                        ? `An image is not available for this ${isTrade ? "scope" : "piece"} yet.`
                        : "The room is here. Its pieces will follow."}
                    </p>
                  </div>
                )}
              </div>
              <figcaption>
                <span>{room.name}</span>
                <span>
                  {hasImage
                    ? "Selection image · not an installation photo"
                    : "Your room’s selection record"}
                </span>
              </figcaption>
            </figure>

            <div
              className="house-preview-detail"
              aria-live="polite"
              aria-atomic="true"
            >
              <p className="material-eyebrow">
                {piece
                  ? isTrade
                    ? "Work in this room"
                    : "In this room"
                  : "A place for what comes next"}
              </p>
              <h3>{piece?.name ?? room.name}</h3>
              {piece && (
                <>
                  <p className="house-preview-status">{stage}</p>
                  {piece.clientLineTotalCents > 0 && (
                    <p className="house-preview-price">
                      {moneyInWords(piece.clientLineTotalCents)}{" "}
                      <span>
                        for{" "}
                        {isTrade
                          ? "this scope"
                          : piece.quantity === 1
                            ? "this piece"
                            : `${piece.quantity} pieces`}
                      </span>
                    </p>
                  )}
                </>
              )}
              {room.pieces.length > 1 && (
                <div
                  className="house-piece-picker"
                  role="group"
                  aria-label={`Preview pieces in ${room.name}`}
                >
                  {room.pieces.map((selection) => (
                    <button
                      key={selection.id}
                      type="button"
                      aria-pressed={selection.id === piece?.id}
                      onClick={() => setPieceId(selection.id)}
                    >
                      {selection.imageUrl &&
                        !brokenUrls.includes(selection.imageUrl) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={selection.imageUrl}
                            alt=""
                            width={52}
                            height={52}
                            loading="lazy"
                            onError={() =>
                              setBrokenUrls((urls) => [
                                ...urls,
                                selection.imageUrl!,
                              ])
                            }
                          />
                        )}
                      <span>{selection.name}</span>
                      <span aria-hidden="true">↗</span>
                    </button>
                  ))}
                </div>
              )}
              <ScoredAction
                actionKey="preview_room"
                surfaceKey="the_threshold"
                regionKey="house_preview"
                variant="secondary"
                href={`#${room.anchor}`}
              >
                Explore this room <span aria-hidden="true">↓</span>
              </ScoredAction>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
