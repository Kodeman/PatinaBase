'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

import { GOODS_JOURNEY_STAGES, journeyStageIndexForStatus } from '@/components/commercial/journey-stepper';
import { galleryHeadline } from '@/lib/threshold/asks-line';
import { waitingSentence, type OtherHouse } from '@/lib/threshold/other-houses';
import type { RoomBandModel } from '@/lib/threshold/derive';
import { plateAlt } from '@/lib/editorial/caption';
import type { EditorialAsset } from '@/lib/editorial/types';
import type { HouseIssue } from './editorial/house-issue';
import { GalleryDrawer, useGalleryRoute } from './gallery-drawer';
import { GalleryPhoto } from './gallery-photo';
import { SilhouettePlate } from './editorial/silhouette-plate';

interface GalleryChapter {
  key: string;
  name: string;
  standing: string | null;
  band: RoomBandModel | null;
  asset: EditorialAsset | null;
}

function galleryChapters(issue: HouseIssue | null, bands: RoomBandModel[]): GalleryChapter[] {
  const editorial = issue?.editorial;
  const keys = [...new Set([
    ...(editorial?.composition?.chapters ?? []).map((chapter) => chapter.key).filter((key) => !['cover', 'progress'].includes(key)),
    ...bands.map((band) => band.anchor),
  ])];
  return keys.flatMap((key) => {
    const band = bands.find((candidate) => candidate.anchor === key) ?? null;
    const words = editorial?.composition?.chapters.find((chapter) => chapter.key === key);
    const image = [...(editorial?.images ?? [])].filter((image) => image.chapterKey === key && image.assetId !== issue?.hero?.id)
      .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
      .map((image) => editorial?.assets.find((asset) => asset.id === image.assetId))
      .find((asset) => asset && asset.ground !== 'white' && asset.sourceKind !== 'concept');
    const asset = image ?? (band ? issue?.rooms.get(band.roomId)?.chapter : null) ?? null;
    if (!band && !asset) return [];
    return [{ key, name: words?.headline || band?.name || 'The house', standing: words?.standing ?? null, band, asset }];
  });
}

function Chapter({ chapter, issue }: { chapter: GalleryChapter; issue: HouseIssue | null }) {
  const piece = chapter.band?.pieces[0];
  return <section id={chapter.key} className="gallery-chapter" aria-label={chapter.name}
    data-threshold-unit={chapter.key} data-dimmable="">
    {chapter.asset ? <GalleryPhoto scope={issue!.scopeId} asset={chapter.asset} palette={issue?.editorial.palette ?? []} />
      : piece ? <SilhouettePlate name={piece.name} category={piece.itemType} className="gallery-silhouette" />
      : <GalleryPhoto scope={issue?.scopeId ?? ''} asset={null} palette={issue?.editorial.palette ?? []} />}
    {chapter.standing && <p className="gallery-standing">{chapter.standing}</p>}
    {chapter.band && <a className="gallery-pieces-link" href={`#pieces-${chapter.band.roomId}`}>
      Every piece in the {chapter.band.name}
    </a>}
  </section>;
}

export function GalleryPieces({ band, extras }: { band: RoomBandModel; extras?: ReactNode }) {
  return <>
    {band.varianceLine && <p>{band.varianceLine}</p>}
    <ul className="gallery-piece-list">
      {band.pieces.map((piece) => <li key={piece.id}>
        {/* eslint-disable-next-line @next/next/no-img-element -- existing client-visible selection image */}
        {piece.imageUrl && <img src={piece.imageUrl} alt="" width={64} height={64} loading="lazy" />}
        <div><p>{piece.name}</p><p>{GOODS_JOURNEY_STAGES[journeyStageIndexForStatus(piece.logisticsStatus)]}</p></div>
      </li>)}
    </ul>
    {extras}
  </>;
}

export function GalleryPage({ projectName, studioName, designerName, preparedFor, issue, ready, heldTooLong,
  line, menuAsks, asks, plan, documents, bands, pieces, note, earlier, footer, roadSentence, otherHouses,
}: {
  projectName: string; studioName: string | null; designerName: string | null; preparedFor: string | null;
  issue: HouseIssue | null; ready: boolean; heldTooLong: boolean; line: string | null;
  menuAsks: ReactNode; asks: ReactNode; plan: ReactNode; documents: (dismiss: () => void) => ReactNode;
  otherHouses: OtherHouse[];
  bands: RoomBandModel[]; pieces: (band: RoomBandModel) => ReactNode;
  note: ReactNode; earlier: ReactNode; footer: ReactNode; roadSentence: ReactNode;
}) {
  const { route, active, dismiss } = useGalleryRoute();
  const chapters = galleryChapters(issue, bands);
  const room = route.kind === 'pieces' ? bands.find((band) => band.roomId === route.roomId) : null;
  const title = route.kind === 'menu' ? projectName : route.kind === 'plan' ? 'The house'
    : route.kind === 'documents' ? 'Documents' : room ? `Every piece in the ${room.name}` : 'Invoices and approvals';
  return <div className="gallery-page" data-testid="the-threshold">
    <header className="gallery-arrival">
      <GalleryPhoto key={issue?.hero?.id ?? 'paint'} scope={issue?.scopeId ?? ''} asset={issue?.hero ?? null}
        palette={issue?.editorial.palette ?? []} arrival />
      <div className="gallery-top"><span className="gallery-chip">{studioName ?? 'Your studio'}</span>
        <a className="gallery-chip gallery-menu-control" href="#menu">Menu</a></div>
      <div className="gallery-band"><h1>{galleryHeadline(issue?.editorial, projectName)}</h1>
        {ready && line ? <a className="gallery-asks-line" href="#doorstep"><span>{line}</span><span aria-hidden="true">→</span></a>
          : <p role="status">{heldTooLong ? 'This is taking longer than it should. Please refresh.' : 'Reading your house…'}</p>}
      </div>
    </header>
    {ready ? <>
      <div id="road" className="gallery-road-sentence">{roadSentence}</div>
      {chapters.map((chapter) => <Chapter key={chapter.key} chapter={chapter} issue={issue} />)}
      <div className="gallery-note">{note}</div>
      <footer className="gallery-footer" id="mat" data-testid="mat">
        <p>{projectName}</p>{preparedFor && <p>Prepared for {preparedFor}</p>}
        <ul><li><a href="#letterbox">Invoices</a></li><li><a href="#approvals">Approvals</a></li>
          <li><a href="#mat-papers">Documents</a></li><li><a href="#previously">Earlier</a></li>
          <li><a href="#contact">{designerName ? `Call ${designerName}` : 'Contact your designer'}</a></li></ul>
        {footer}
        <div className="gallery-earlier"><h2>Earlier</h2>{earlier}</div>
      </footer>
    </> : <div data-testid="threshold-hold" className="gallery-hold" />}
    <GalleryDrawer open={active} title={title} onDismiss={dismiss} anchor={route.kind === 'asks' ? route.anchor : undefined}>
      {/* Payment and consent owners remain mounted while the index is open or closed. */}
      <div hidden={route.kind !== 'asks'}>{ready && asks}</div>
      {route.kind === 'menu' && <nav aria-label="Page index">
        {preparedFor && <p>Prepared for {preparedFor}</p>}
        <ul className="gallery-index">{ready && menuAsks}
          {otherHouses.map((house) => <li key={house.id}><Link href={`/projects/${house.id}`}>{house.name}<small>{waitingSentence(house)}</small></Link></li>)}
          {chapters.map((chapter) => <li key={chapter.key}><a href={`#${chapter.key}`}>{chapter.name}</a></li>)}
          <li><a href="#key">The house</a></li><li><a href="#letterbox">Invoices</a></li>
          <li><a href="#mat-papers">Documents</a></li><li><a href="#note">A note from {designerName ?? 'your designer'}</a></li>
          <li><a href="#contact">{designerName ? `Call ${designerName}` : 'Contact your designer'}</a></li>
        </ul>
      </nav>}
      {route.kind === 'plan' && plan}
      {route.kind === 'documents' && documents(dismiss)}
      {room && pieces(room)}
    </GalleryDrawer>
  </div>;
}
