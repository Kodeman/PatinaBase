import * as React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Row,
  Column,
  Text,
  Link,
  Preview,
} from '@react-email/components';
import { COLORS, FONTS, COLOR_BAR, FONT_LINK, HEAD_CSS, TAGLINE, URLS } from './brand';

export interface BaseEmailLayoutProps {
  preview?: string;
  children: React.ReactNode;
  /** Unsubscribe link; defaults to the in-app notification settings page. */
  unsubscribeUrl?: string;
  /** Mono eyebrow shown top-right of the header (e.g. "New account"). */
  eyebrow?: string;
  showFooter?: boolean;
  /**
   * Hides the wordmark header block. Used by templates that must read as a
   * plain personal note — e.g. the designer-invite-nudge-2 letter.
   * Defaults to true.
   */
  showHeader?: boolean;
}

export const BaseEmailLayout: React.FC<BaseEmailLayoutProps> = ({
  preview,
  children,
  unsubscribeUrl,
  eyebrow,
  showFooter = true,
  showHeader = true,
}) => {
  const unsub = unsubscribeUrl || URLS.prefs;
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONT_LINK} />
        <style dangerouslySetInnerHTML={{ __html: HEAD_CSS }} />
      </Head>
      {preview && <Preview>{preview}</Preview>}
      <Body className="bg" style={styles.body}>
        <Container className="container shell" style={styles.shell}>
          {/* Signature color-bar */}
          <Row>
            {COLOR_BAR.map((c, i) => (
              <Column key={i} style={{ ...styles.bar, backgroundColor: c }}>
                &nbsp;
              </Column>
            ))}
          </Row>

          {showHeader && (
            <Section className="px" style={styles.headerPad}>
              <Row>
                <Column align="left" style={{ verticalAlign: 'middle' }}>
                  <Text className="wordmark" style={styles.wordmark}>
                    Patina
                  </Text>
                </Column>
                {eyebrow && (
                  <Column align="right" style={{ verticalAlign: 'middle' }}>
                    <Text className="ink3" style={styles.eyebrow}>
                      {eyebrow}
                    </Text>
                  </Column>
                )}
              </Row>
            </Section>
          )}

          {/* Body */}
          <Section className="px" style={styles.content}>
            {children}
          </Section>

          {showFooter && (
            <>
              <Section className="px" style={styles.footerHairPad}>
                <div className="hairbg" style={styles.hair}>
                  &nbsp;
                </div>
              </Section>
              <Section className="px" style={styles.footerPad}>
                <Row>
                  <Column align="left" style={{ verticalAlign: 'top' }}>
                    <Text className="ink2" style={styles.footerBrand}>
                      Patina
                    </Text>
                    <Text className="ink3" style={styles.footerTagline}>
                      A workshop for interior designers
                      <br />
                      and the makers they trust.
                    </Text>
                  </Column>
                  <Column align="right" style={{ verticalAlign: 'top' }}>
                    <Link href={URLS.dashboard} style={styles.footerLink}>
                      Dashboard
                    </Link>
                    <br />
                    <Link href={URLS.help} style={styles.footerLink}>
                      Help center
                    </Link>
                    <br />
                    <Link href={unsub} style={styles.footerLink}>
                      Email preferences
                    </Link>
                  </Column>
                </Row>
              </Section>
            </>
          )}
        </Container>

        {showFooter && (
          <Container style={styles.legalContainer}>
            <Text className="ink3" style={styles.legal}>
              Patina &nbsp;·&nbsp; {TAGLINE}
            </Text>
          </Container>
        )}
      </Body>
    </Html>
  );
};

const styles = {
  body: {
    backgroundColor: COLORS.paper,
    fontFamily: FONTS.sans,
    margin: '0',
    padding: '24px 12px',
  },
  shell: {
    width: '600px',
    maxWidth: '600px',
    backgroundColor: COLORS.card,
    border: `1px solid ${COLORS.line}`,
    borderRadius: '12px',
    overflow: 'hidden',
  },
  bar: { height: '4px', fontSize: '0', lineHeight: '0' },
  headerPad: { padding: '26px 40px 0' },
  wordmark: {
    fontFamily: FONTS.serif,
    fontSize: '23px',
    fontWeight: 600 as const,
    letterSpacing: '-0.01em',
    color: COLORS.ink,
    margin: '0',
  },
  eyebrow: {
    fontFamily: FONTS.mono,
    fontSize: '11px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    color: COLORS.ink3,
    margin: '0',
  },
  content: { padding: '22px 40px 0' },
  footerHairPad: { padding: '34px 40px 0' },
  hair: { height: '1px', backgroundColor: COLORS.line, fontSize: '0', lineHeight: '0' },
  footerPad: { padding: '22px 40px 32px' },
  footerBrand: { fontFamily: FONTS.serif, fontSize: '15px', color: COLORS.ink2, margin: '0 0 5px' },
  footerTagline: {
    fontFamily: FONTS.sans,
    fontSize: '13px',
    lineHeight: '1.5',
    color: COLORS.ink3,
    margin: '0',
  },
  footerLink: {
    fontFamily: FONTS.sans,
    fontSize: '13px',
    lineHeight: '1.95',
    color: COLORS.verd,
    textDecoration: 'none',
  },
  legalContainer: { width: '600px', maxWidth: '600px' },
  legal: {
    fontFamily: FONTS.mono,
    fontSize: '11px',
    lineHeight: '1.8',
    letterSpacing: '0.03em',
    color: COLORS.ink3,
    textAlign: 'center' as const,
    padding: '18px 40px 10px',
    margin: '0',
  },
};

export default BaseEmailLayout;
