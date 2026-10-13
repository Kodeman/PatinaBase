'use client';

/**
 * The Help Center's Header line (US-28 S6; uplift.md (b)6): the back act, the
 * `.t-d2` title, then the double rule. On `/help` the title is the page's
 * heading; on a nested page it is the way back to the index, and the page's
 * own title is its heading.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DocumentAction } from '@/components/document/document-action';

export function HelpHeaderLine() {
  const pathname = usePathname();
  const atIndex = pathname === '/help';

  return (
    <>
      <header className="hline">
        <div className="hline-l">
          <DocumentAction actionKey="help-back-to-desk" href="/desk" variant="tertiary" leading="←">
            Desk
          </DocumentAction>
          {atIndex ? (
            <h1 className="t-d2">Help</h1>
          ) : (
            <p className="t-d2">
              <Link href="/help" className="name">
                Help
              </Link>
            </p>
          )}
        </div>
      </header>
      <div className="rule-strong" role="presentation" />
    </>
  );
}
