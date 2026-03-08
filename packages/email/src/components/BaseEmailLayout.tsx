import * as React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Link,
  Hr,
  Font,
  Preview,
} from '@react-email/components';

export interface BaseEmailLayoutProps {
  preview?: string;
  children: React.ReactNode;
  unsubscribeUrl?: string;
  showFooter?: boolean;
}

// Brand constants
const BRAND = {
  linen: '#FAF7F2',
  warmGold: '#C4A57B',
  deepGold: '#8B7355',
  charcoal: '#2C2926',
  warmGray: '#6B645D',
  white: '#FFFFFF',
};

export const BaseEmailLayout: React.FC<BaseEmailLayoutProps> = ({
  preview,
  children,
  unsubscribeUrl,
  showFooter = true,
}) => {
  return (
    <Html>
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily="Helvetica"
          webFont={{
            url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap',
            format: 'woff2',
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      {preview && <Preview>{preview}</Preview>}
      <Body style={styles.body}>
        <Container style={styles.container}>
          {/* Header with warm gradient */}
          <Section style={styles.header}>
            <Text style={styles.logo}>Patina</Text>
          </Section>

          {/* Content */}
          <Section style={styles.content}>
            {children}
          </Section>

          {/* Footer */}
          {showFooter && (
            <Section style={styles.footer}>
              <Hr style={styles.divider} />
              <Text style={styles.footerText}>
                Patina — Furniture intelligence for design professionals
              </Text>
              <Text style={styles.footerAddress}>
                Patina Inc. · 123 Design Way, Suite 100 · San Francisco, CA 94102
              </Text>
              {unsubscribeUrl && (
                <Text style={styles.footerLinks}>
                  <Link href={unsubscribeUrl} style={styles.footerLink}>
                    Unsubscribe
                  </Link>
                  {' · '}
                  <Link href="https://patina.cloud/preferences" style={styles.footerLink}>
                    Manage preferences
                  </Link>
                </Text>
              )}
            </Section>
          )}
        </Container>
      </Body>
    </Html>
  );
};

const styles = {
  body: {
    backgroundColor: BRAND.linen,
    fontFamily: 'Inter, Helvetica, Arial, sans-serif',
    margin: '0',
    padding: '0',
  },
  container: {
    maxWidth: '600px',
    margin: '0 auto',
    backgroundColor: BRAND.white,
  },
  header: {
    background: `linear-gradient(135deg, ${BRAND.warmGold}, ${BRAND.deepGold})`,
    padding: '32px 40px',
    textAlign: 'center' as const,
  },
  logo: {
    color: BRAND.white,
    fontSize: '28px',
    fontWeight: '600' as const,
    letterSpacing: '2px',
    margin: '0',
  },
  content: {
    padding: '40px',
  },
  footer: {
    backgroundColor: BRAND.charcoal,
    padding: '32px 40px',
  },
  divider: {
    borderColor: '#4A453F',
    margin: '0 0 24px 0',
  },
  footerText: {
    color: '#A09890',
    fontSize: '13px',
    lineHeight: '20px',
    margin: '0 0 8px 0',
    textAlign: 'center' as const,
  },
  footerAddress: {
    color: '#7A736C',
    fontSize: '11px',
    lineHeight: '16px',
    margin: '0 0 12px 0',
    textAlign: 'center' as const,
  },
  footerLinks: {
    color: '#7A736C',
    fontSize: '11px',
    lineHeight: '16px',
    margin: '0',
    textAlign: 'center' as const,
  },
  footerLink: {
    color: BRAND.warmGold,
    textDecoration: 'underline',
  },
};

export default BaseEmailLayout;
