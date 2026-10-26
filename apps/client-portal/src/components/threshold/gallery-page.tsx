'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { formatCurrency } from '@patina/shared';

import { GOODS_JOURNEY_STAGES, journeyStageIndexForStatus, TRADE_JOURNEY_STAGES, tradeJourneyStageIndexForState } from '@/components/commercial/journey-stepper';
import type { ClientSelection } from '@/lib/commercial-documents';
import { galleryHeadline } from '@/lib/threshold/asks-line';
import { menuWaitingSentence, type OtherHouse } from '@/lib/threshold/other-houses';
import type { RoomBandModel } from '@/lib/threshold/derive';
import type { EditorialAsset } from '@/lib/editorial/types';
import { Pieces as EditorialPieces, type HouseIssue } from './editorial/house-issue';
import { GalleryDrawer, useGalleryRoute } from './gallery-drawer';
import { GalleryPhoto } from './gallery-photo';
import { arrivalPieces } from '@/lib/editorial/rank';
import { SilhouettePlate } from './editorial/silhouette-plate';
import { PiecePlate } from './editorial/piece-plate';
import { ConceptRenderPlate, floorLine, stampDetail } from './room-band';

interface GalleryChapter {
  key: string;
  name: string;
  standing: string | null;
  band: RoomBandModel | null;
  asset: EditorialAsset | null;
}

function chapterAsset(issue: HouseIssue, key: string): EditorialAsset | null {
  const images = issue.editorial.images ?? [];
  const candidates = images.filter((image) => image.chapterKey === key && image.assetId !== issue.hero?.id)
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  for (const image of candidates) {
    const asset = issue.editorial.assets.find((item) => item.id === image.assetId);
    if (asset && asset.ground !== 'white') return asset;
  }
  return null;
}

function chapterWords(issue: HouseIssue | null, key: string) {
  return issue?.editorial.composition?.chapters.find((chapter) => chapter.key === key);
}

function chapterName(words: ReturnType<typeof chapterWords>, band: RoomBandModel | null) { return words?.headline || band?.name || 'The house'; }
function roomAsset(issue: HouseIssue | null, band: RoomBandModel | null) { return band ? issue?.rooms.get(band.roomId)?.chapter : null; }
function chapterDetails(words: ReturnType<typeof chapterWords>, band: RoomBandModel | null) {
  return { name: chapterName(words, band), standing: words?.standing ?? null };
}
function chapterBand(bands: RoomBandModel[], key: string) { return bands.find(band => band.anchor === key) ?? null; }
function chosenAsset(issue: HouseIssue | null, key: string, band: RoomBandModel | null) {
  return (issue ? chapterAsset(issue, key) : null) ?? roomAsset(issue, band) ?? null;
}
function makeChapter(issue: HouseIssue | null, bands: RoomBandModel[], key: string): GalleryChapter | null {
  const band = chapterBand(bands, key);
  const asset = chosenAsset(issue, key, band);
  if (!band && !asset) return null;
  return { key, ...chapterDetails(chapterWords(issue, key), band), band, asset };
}

function galleryChapters(issue: HouseIssue | null, bands: RoomBandModel[]): GalleryChapter[] {
  const composed = issue?.editorial.composition?.chapters ?? [];
  const keys = [...new Set([...composed.map((chapter) => chapter.key), ...(issue?.heldHouseAsset ? ['house'] : []), ...bands.map((band) => band.anchor)])];
  return keys.filter((key) => !['cover', 'progress'].includes(key))
    .map((key) => makeChapter(issue, bands, key)).filter((chapter): chapter is GalleryChapter => chapter !== null);
}

function ChapterPicture({ chapter, issue, studioName }: { chapter: GalleryChapter; issue: HouseIssue | null; studioName: string | null }) {
  if (chapter.asset) return <GalleryPhoto scope={issue!.scopeId} asset={chapter.asset} palette={issue!.editorial.palette} />;
  if (chapter.band?.conceptRender) return <ConceptRenderPlate render={chapter.band.conceptRender} roomName={chapter.band.name} studioName={studioName} />;
  return <ChapterPieces chapter={chapter} issue={issue} />;
}
function ChapterPieces({ chapter, issue }: { chapter: GalleryChapter; issue: HouseIssue | null }) {
  const room = issue?.editorial.rooms.find(room => room.id === chapter.band?.roomId);
  const choices = issue?.rooms.get(room?.id ?? '')?.pieces;
  if (room && choices?.some(piece => piece.asset)) return <ul className="gallery-chapter-pieces" aria-label={`Pieces for the ${room.name.toLowerCase()}`}>
    {[...room.items].sort((a, b) => Number(Boolean(choices.find(piece => piece.itemId === b.id)?.asset)) - Number(Boolean(choices.find(piece => piece.itemId === a.id)?.asset))).slice(0, 4).map(item => <li key={item.id}><PiecePlate scopeId={issue!.scopeId}
      showMakers={issue!.editorial.project.showMakers} item={item}
      asset={choices.find(piece => piece.itemId === item.id)?.asset ?? null} statusWords="" /></li>)}
  </ul>;
  const piece = chapter.band?.pieces[0];
  if (piece) return <SilhouettePlate name={piece.name} category={piece.itemType} className="gallery-silhouette" />;
  return null;
}

function ChapterStanding({ chapter }: { chapter: GalleryChapter }) {
  // Current movement wins over an edition's older snapshot of the room.
  const live = chapter.band ? floorLine(chapter.band.pieces) : null;
  const sentence = live ?? chapter.standing;
  return sentence ? <p className="gallery-standing">{sentence}</p> : null;
}

function Chapter({ chapter, issue, studioName }: { chapter: GalleryChapter; issue: HouseIssue | null; studioName: string | null }) {
  return <section id={chapter.key} className="gallery-chapter" aria-label={chapter.name}
    data-threshold-unit={chapter.key} data-dimmable="">
    <ChapterPicture chapter={chapter} issue={issue} studioName={studioName} />
    <ChapterStanding chapter={chapter} />
    {chapter.band && <a className="gallery-pieces-link" href={`#pieces-${chapter.band.roomId}`}>
      Every piece in the {chapter.band.name}
    </a>}
  </section>;
}

function pieceStatus(piece: ClientSelection): string {
  if (piece.kind === 'trade') return TRADE_JOURNEY_STAGES[tradeJourneyStageIndexForState(piece.tradeJourney ?? 'none')];
  return GOODS_JOURNEY_STAGES[journeyStageIndexForStatus(piece.logisticsStatus)];
}

function PieceInstrument({ piece }: { piece: ClientSelection }) {
  const detail = stampDetail(piece);
  return <>{detail && <p>{detail}</p>}{piece.docCode && <p>{piece.docCode}</p>}</>;
}
function PieceImages({ piece }: { piece: ClientSelection }) {
  const urls = [...new Set([piece.imageUrl, ...(piece.imageUrls ?? [])])].filter((url): url is string => !!url);
  return <div>{urls.map(url =>
    // eslint-disable-next-line @next/next/no-img-element -- existing client-visible selection images
    <img key={url} src={url} alt="" width={64} height={64} loading="lazy" />)}</div>;
}
function PieceFacts({ piece }: { piece: ClientSelection }) {
  return <div><p>{piece.name}</p><p>{pieceStatus(piece)}</p>
    {piece.quantity > 1 && <p>{piece.quantity} of them</p>}
    {piece.clientLineTotalCents != null && piece.clientLineTotalCents > 0 && <p>{formatCurrency(piece.clientLineTotalCents)}</p>}
    <PieceInstrument piece={piece} />
  </div>;
}

export function GalleryPieces({ band, issue, extras }: { band: RoomBandModel; issue?: HouseIssue | null; extras?: ReactNode }) {
  const choice = issue?.rooms.get(band.roomId);
  // Live studio facts do not replace an edition's recorded external responsibility.
  const frozenIssue = issue && band.pieces.length > 0 ? {
    ...issue,
    editorial: { ...issue.editorial, rooms: issue.editorial.rooms.map((room) => room.id === band.roomId
      ? { ...room, items: room.items.filter((item) => item.responsibility === 'external') }
      : room) },
  } : issue;
  const recordedRoom = frozenIssue?.editorial.rooms.find((room) => room.id === band.roomId);
  const recordLabel = issue?.editorial.edition ? 'In the shared edition' : 'In the house record';
  return <>
    {band.varianceLine && <p>{band.varianceLine}</p>}
    {band.pieces.length > 0 && <section aria-label="Current studio pieces">
      <h3 className="mt-6 font-medium">Current studio pieces</h3>
      <ul className="gallery-piece-list">
        {band.pieces.map((piece) => <li key={piece.id} data-threshold-piece={piece.id}>
          <PieceImages piece={piece} />
          <PieceFacts piece={piece} />
        </li>)}
      </ul>
    </section>}
    {frozenIssue && choice && recordedRoom && recordedRoom.items.length > 0 && <section aria-label={recordLabel}>
      <h3 className="mt-6 font-medium">{recordLabel}</h3>
      <EditorialPieces issue={frozenIssue} choice={choice} />
    </section>}
    {extras}
  </>;
}

interface GalleryPageProps {
  projectName: string; studioName: string | null; designerName: string | null; preparedFor: string | null;
  issue: HouseIssue | null; ready: boolean; heldTooLong: boolean; line: string | null;
  menuAsks: ReactNode; asks: ReactNode; plan: ReactNode; documents: (dismiss: () => void) => ReactNode;
  otherHouses: OtherHouse[];
  openApprovalIds?: readonly string[] | null;
  approvalReadPending?: boolean;
  bands: RoomBandModel[]; pieces: (band: RoomBandModel) => ReactNode;
  note: ReactNode; earlier: ReactNode; footer: ReactNode; roadSentence: ReactNode;
}

function contactLabel(name: string | null) { return name ? `Call ${name}` : 'Contact your designer'; }
function BandStatus({ ready, line, heldTooLong }: Pick<GalleryPageProps, 'ready' | 'line' | 'heldTooLong'>) {
  if (ready) return <a className="gallery-asks-line" href="#doorstep"><span>{line ?? 'Your asks could not all be read. Please check them.'}</span><span aria-hidden="true">→</span></a>;
  return <p role="status">{heldTooLong ? 'This is taking longer than it should. Please refresh.' : 'Reading your house…'}</p>;
}

function arrivalPhoto(issue: HouseIssue | null) {
  return { scope: issue?.scopeId ?? '', asset: issue?.hero ?? null, palette: issue?.editorial.palette ?? [] };
}
function ArrivalVisual({ issue }: { issue: HouseIssue | null }) {
  const pieces = issue && !issue.hero ? arrivalPieces(issue.editorial) : [];
  if (!pieces.length) return <GalleryPhoto key={issue?.hero?.id ?? 'paint'} {...arrivalPhoto(issue)} arrival />;
  return <div className="gallery-arrival-still-life" data-gallery-mode="pieces">
    <ul className="gallery-chapter-pieces" aria-label="Photographs of the pieces">
      {pieces.map(({ item, asset }) => <li key={item.id}><PiecePlate scopeId={issue!.scopeId}
        showMakers={issue!.editorial.project.showMakers} item={item} asset={asset} statusWords="" /></li>)}
    </ul>
  </div>;
}
function Arrival(props: GalleryPageProps) {
  const { issue } = props;
  return <header className="gallery-arrival">
    <ArrivalVisual issue={issue} />
    <div className="gallery-top"><span className="gallery-chip">{props.studioName ?? 'Your studio'}</span>
      <a className="gallery-chip gallery-menu-control" href="#menu">Menu</a></div>
    <div className="gallery-band"><h1>{galleryHeadline(issue?.editorial, props.projectName)}</h1><BandStatus {...props} /></div>
  </header>;
}

function PageFooter(props: GalleryPageProps) {
  return <footer className="gallery-footer" id="mat" data-testid="mat">
    <p>{props.projectName}</p>{props.preparedFor && <p>Prepared for {props.preparedFor}</p>}
    <ul><li><a href="#letterbox">Invoices</a></li><li><a href="#approvals">Approvals</a></li>
      <li><a href="#mat-papers">Documents</a></li><li><a href="#previously">Earlier</a></li>
      <li><a href="#contact">{contactLabel(props.designerName)}</a></li></ul>
    {props.footer}<div className="gallery-earlier"><h2>Earlier</h2>{props.earlier}</div>
  </footer>;
}

function otherHouseLine(house: OtherHouse) {
  const sentence = menuWaitingSentence(house);
  return sentence ? `, ${(sentence.startsWith('Nothing') ? 'N' : sentence.charAt(0).toLowerCase())}${sentence.slice(1)}` : '';
}
function GalleryIndex({ props, chapters }: { props: GalleryPageProps; chapters: GalleryChapter[] }) {
  return <nav aria-label="Page index">
    {props.preparedFor && <p>Prepared for {props.preparedFor}</p>}
    <ul className="gallery-index">{props.ready && props.menuAsks}
      {props.otherHouses.map((house) => <li key={house.id}><Link href={`/projects/${house.id}`}>{house.name + otherHouseLine(house)}</Link></li>)}
      {chapters.map((chapter) => <li key={chapter.key}><a href={`#${chapter.key}`}>{chapter.name}</a></li>)}
      <li><a href="#key">The house</a></li><li><a href="#letterbox">Invoices</a></li>
      <li><a href="#mat-papers">Documents</a></li><li><a href="#contact">{contactLabel(props.designerName)}</a></li>
    </ul>
  </nav>;
}

const DRAWER_TITLES = { menu: '', plan: 'The house', documents: 'Documents', asks: 'Invoices and approvals', page: '', scroll: '', pieces: '' };

function GalleryBody({ props, chapters }: { props: GalleryPageProps; chapters: GalleryChapter[] }) {
  if (!props.ready) return <div data-testid="threshold-hold" className="gallery-hold" />;
  return <><div id="road" className="gallery-road-sentence">{props.roadSentence}</div>
    {chapters.map((chapter) => <Chapter key={chapter.key} chapter={chapter} issue={props.issue} studioName={props.studioName} />)}
    <div className="gallery-note">{props.note}</div><PageFooter {...props} /></>;
}

function roomContents(roomId: string, props: GalleryPageProps) {
  const room = props.bands.find(band => band.roomId === roomId);
  return room ? props.pieces(room) : null;
}
function DrawerContents({ route, props, chapters, dismiss }: { route: ReturnType<typeof useGalleryRoute>['route']; props: GalleryPageProps; chapters: GalleryChapter[]; dismiss: () => void }) {
  switch (route.kind) {
    case 'menu': return <GalleryIndex props={props} chapters={chapters} />;
    case 'plan': return props.plan;
    case 'documents': return props.documents(dismiss);
    case 'pieces': {
      return roomContents(route.roomId, props);
    }
    default: return null;
  }
}
function drawerTitle(route: ReturnType<typeof useGalleryRoute>['route'], props: GalleryPageProps) {
  if (route.kind !== 'pieces') return DRAWER_TITLES[route.kind] || props.projectName;
  const room = props.bands.find(band => band.roomId === route.roomId);
  return room ? 'Every piece in the ' + room.name : props.projectName;
}
function askAnchor(route: ReturnType<typeof useGalleryRoute>['route']) { return route.kind === 'asks' ? route.anchor : undefined; }
export function GalleryPage(props: GalleryPageProps) {
  const { route, active, dismiss } = useGalleryRoute(props.approvalReadPending ? null : props.openApprovalIds);
  const chapters = galleryChapters(props.issue, props.bands);
  const title = drawerTitle(route, props);
  return <div className="gallery-page" data-testid="the-threshold">
    <Arrival {...props} /><GalleryBody props={props} chapters={chapters} />
    <GalleryDrawer open={active} title={title} onDismiss={dismiss} anchor={askAnchor(route)}>
      {/* Payment and consent owners remain mounted while the index is open or closed. */}
      <div hidden={route.kind !== 'asks'}>{props.ready && props.asks}</div>
      <DrawerContents route={route} props={props} chapters={chapters} dismiss={dismiss} />
    </GalleryDrawer>
  </div>;
}
