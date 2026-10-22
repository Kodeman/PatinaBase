import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy · Patina',
  description: 'What Patina keeps for your studio, and what is used to lay out your project page.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--paper-doc)] px-6 py-12 text-[var(--ink)] sm:py-20">
      <article className="t-body mx-auto max-w-2xl space-y-10">
        <header className="space-y-4">
          <p className="t-head">Your project record</p>
          <h1 className="t-d1">Privacy</h1>
        </header>

        <section aria-labelledby="the-page" className="space-y-3">
          <h2 id="the-page" className="t-d3">Your project page</h2>
          <p>Your project page is prepared by your studio and printed by Patina. It is a place to read the work taking shape in your home.</p>
        </section>

        <section aria-labelledby="the-record" className="space-y-3">
          <h2 id="the-record" className="t-d3">What Patina keeps</h2>
          <p>Patina keeps the project record your studio keeps: items, rooms, dates, the studio’s photographs and drawings, and invoices.</p>
        </section>

        <section aria-labelledby="composition" className="space-y-3">
          <h2 id="composition" className="t-d3">What goes to the composing service</h2>
          <p>Everything listed below is sent to the Anthropic API, which composes the page.</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Item names as your studio signed them</li>
            <li>What kind of piece each item is, and how far along it is</li>
            <li>Descriptions and dimensions as signed</li>
            <li>Materials and finishes</li>
            <li>Room names</li>
            <li>The project phase and target date</li>
            <li>Palette names</li>
            <li>The page's current headlines and sentences, including your studio's edits</li>
            <li>Maker name and where each piece is made, when your studio turns that on</li>
            <li>Photographs of the specified pieces</li>
            <li>Renderings your studio makes of your rooms</li>
            <li>Photographs taken in your home — room scans and photographs after installation</li>
          </ul>
          <p>Patina never uses these photographs to make a picture of your home that does not exist.</p>
        </section>

        <section aria-labelledby="kept-out" className="space-y-3">
          <h2 id="kept-out" className="t-d3">What stays out</h2>
          <p>These are never sent:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Your address</li>
            <li>The names of the people in your household</li>
            <li>The project’s name</li>
            <li>Prices</li>
            <li>Your studio’s private notes</li>
            <li>Drawing sheets and their titles</li>
            <li>Boards and their names</li>
          </ul>
        </section>

        <section aria-labelledby="pictures" className="space-y-3">
          <h2 id="pictures" className="t-d3">Where the pictures live</h2>
          <p>The pictures on your project page are private copies stored on Cloudflare. They are served only to signed-in members of your project and cached for an hour.</p>
        </section>

        <section aria-labelledby="removal" className="space-y-3">
          <h2 id="removal" className="t-d3">Ask for removal</h2>
          <p>To ask for removal, write to your studio using the contact on your project page’s letterhead, or write to <a className="underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--focus-ring)]" href="mailto:hello@patina.cloud">hello@patina.cloud</a>.</p>
        </section>

        <section aria-labelledby="effective" className="space-y-3">
          <h2 id="effective" className="t-d3">About this notice</h2>
          <p>Effective <time dateTime="2026-10-21">21 October 2026</time>.</p>
          <p>This page will be reviewed by counsel; until then it describes what the software does.</p>
        </section>
      </article>
    </main>
  );
}
