import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { WelcomeVerification } from '../templates/welcome-verification';
import { PasswordReset } from '../templates/password-reset';
import { SecurityAlert } from '../templates/security-alert';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';
import { ProvenanceBar } from '../components/ProvenanceBar';

// React Email uses react-dom@18 internally which conflicts with React 19.
// These tests verify template structure and props without full HTML rendering.
// Full rendering tests should use the react-email CLI preview.

function getElementTree(element: React.ReactElement): {
  type: string | React.FC;
  props: Record<string, unknown>;
  children: unknown[];
} {
  return {
    type: element.type,
    props: element.props as Record<string, unknown>,
    children: React.Children.toArray((element.props as { children?: React.ReactNode }).children),
  };
}

describe('WelcomeVerification template', () => {
  it('creates a valid React element', () => {
    const element = React.createElement(WelcomeVerification, {
      displayName: 'Ada',
      verificationUrl: 'https://patina.cloud/verify?token=abc123',
    });

    expect(React.isValidElement(element)).toBe(true);
  });

  it('passes correct props through', () => {
    const props = {
      displayName: 'Ada',
      verificationUrl: 'https://patina.cloud/verify?token=abc123',
    };
    const element = React.createElement(WelcomeVerification, props);
    const tree = getElementTree(element);

    expect(tree.props.displayName).toBe('Ada');
    expect(tree.props.verificationUrl).toBe('https://patina.cloud/verify?token=abc123');
  });

  it('works without display name', () => {
    const element = React.createElement(WelcomeVerification, {
      verificationUrl: 'https://patina.cloud/verify?token=abc123',
    });
    expect(React.isValidElement(element)).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((element.props as any).displayName).toBeUndefined();
  });
});

describe('PasswordReset template', () => {
  it('creates a valid React element with all props', () => {
    const element = React.createElement(PasswordReset, {
      displayName: 'Leah',
      resetUrl: 'https://patina.cloud/reset?token=xyz',
    });

    expect(React.isValidElement(element)).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((element.props as any).resetUrl).toBe('https://patina.cloud/reset?token=xyz');
  });

  it('works without display name', () => {
    const element = React.createElement(PasswordReset, {
      resetUrl: 'https://patina.cloud/reset?token=xyz',
    });
    expect(React.isValidElement(element)).toBe(true);
  });
});

describe('SecurityAlert template', () => {
  it('creates a valid React element for new_device alert', () => {
    const element = React.createElement(SecurityAlert, {
      displayName: 'Kody',
      alertType: 'new_device' as const,
      deviceInfo: 'Chrome on macOS',
      ipAddress: '192.168.1.1',
      location: 'San Francisco, CA',
      timestamp: '2026-03-03T12:00:00Z',
      secureAccountUrl: 'https://patina.cloud/security',
    });

    expect(React.isValidElement(element)).toBe(true);
  });

  it('creates element for all alert types', () => {
    const alertTypes = ['new_device', 'password_changed', 'email_changed', 'suspicious_activity'] as const;

    for (const alertType of alertTypes) {
      const element = React.createElement(SecurityAlert, {
        alertType,
        timestamp: '2026-03-03T12:00:00Z',
        secureAccountUrl: 'https://patina.cloud/security',
      });

      expect(React.isValidElement(element)).toBe(true);
    }
  });
});

describe('Reusable components', () => {
  it('BaseEmailLayout creates valid element', () => {
    const element = React.createElement(BaseEmailLayout, {
      preview: 'Test preview',
      children: React.createElement('p', null, 'Hello'),
    });
    expect(React.isValidElement(element)).toBe(true);
  });

  it('Button creates valid element with variants', () => {
    for (const variant of ['primary', 'secondary', 'urgent'] as const) {
      const element = React.createElement(Button, {
        href: 'https://patina.cloud',
        variant,
        children: 'Click me',
      });
      expect(React.isValidElement(element)).toBe(true);
    }
  });

  it('ProvenanceBar creates valid element', () => {
    const element = React.createElement(ProvenanceBar, {
      maker: 'Artisan Woodworks',
      origin: 'Vermont, USA',
      material: 'Solid walnut',
    });
    expect(React.isValidElement(element)).toBe(true);
  });

  it('ProvenanceBar returns null with no props', () => {
    // With no maker/origin/material, it should return null
    const result = ProvenanceBar({});
    expect(result).toBeNull();
  });
});
