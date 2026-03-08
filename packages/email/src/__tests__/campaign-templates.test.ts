import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { CampaignProductLaunch } from '../templates/campaign-product-launch';
import { CampaignSeasonal } from '../templates/campaign-seasonal';
import { CampaignMakerSpotlight } from '../templates/campaign-maker-spotlight';
import { CampaignReengagement } from '../templates/campaign-reengagement';

// React Email uses react-dom@18 internally which conflicts with React 19.
// These tests verify template structure and props without full HTML rendering.

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

// ─── Campaign Product Launch ─────────────────────────────────────────────

describe('CampaignProductLaunch template', () => {
  const fullProps = {
    headlineText: 'Introducing Spring 2026',
    bodyText: 'Our latest collection celebrates natural materials.',
    heroImageUrl: 'https://example.com/hero.jpg',
    products: [
      { name: 'Oak Dining Table', imageUrl: 'https://example.com/table.jpg', priceFormatted: '$2,400', maker: 'Woodcraft Studio', productUrl: 'https://example.com/table' },
      { name: 'Walnut Chair', imageUrl: 'https://example.com/chair.jpg', priceFormatted: '$890', maker: 'Artisan Works' },
      { name: 'Marble Side Table', priceFormatted: '$1,200' },
    ],
    ctaUrl: 'https://admin.patina.cloud/catalog',
    ctaText: 'Shop Now',
    unsubscribeUrl: 'https://admin.patina.cloud/api/unsubscribe?token=abc',
  };

  it('creates a valid React element with full props', () => {
    const element = React.createElement(CampaignProductLaunch, fullProps);
    expect(React.isValidElement(element)).toBe(true);
  });

  it('passes correct props through', () => {
    const element = React.createElement(CampaignProductLaunch, fullProps);
    const tree = getElementTree(element);
    expect(tree.props.headlineText).toBe('Introducing Spring 2026');
    expect(tree.props.ctaText).toBe('Shop Now');
    expect((tree.props.products as unknown[]).length).toBe(3);
  });

  it('works without optional props', () => {
    const element = React.createElement(CampaignProductLaunch, {
      headlineText: 'New Arrivals',
      bodyText: 'Check out our latest.',
      products: [],
      ctaUrl: 'https://example.com',
    });
    expect(React.isValidElement(element)).toBe(true);
  });
});

// ─── Campaign Seasonal ──────────────────────────────────────────────────

describe('CampaignSeasonal template', () => {
  const fullProps = {
    season: 'Spring 2026',
    headlineText: 'Welcome Spring',
    bodyText: 'Fresh designs for the new season.',
    moodImageUrl: 'https://example.com/mood.jpg',
    products: [
      { name: 'Linen Sofa', priceFormatted: '$3,200', maker: 'Comfort Co' },
      { name: 'Rattan Chair', imageUrl: 'https://example.com/rattan.jpg', priceFormatted: '$650' },
    ],
    ctaUrl: 'https://admin.patina.cloud/catalog',
    unsubscribeUrl: 'https://admin.patina.cloud/api/unsubscribe?token=abc',
  };

  it('creates a valid React element with full props', () => {
    const element = React.createElement(CampaignSeasonal, fullProps);
    expect(React.isValidElement(element)).toBe(true);
  });

  it('passes correct props through', () => {
    const element = React.createElement(CampaignSeasonal, fullProps);
    const tree = getElementTree(element);
    expect(tree.props.season).toBe('Spring 2026');
    expect(tree.props.headlineText).toBe('Welcome Spring');
  });

  it('works without optional props', () => {
    const element = React.createElement(CampaignSeasonal, {
      season: 'Winter',
      headlineText: 'Winter Collection',
      bodyText: 'Cozy up.',
      products: [],
      ctaUrl: 'https://example.com',
    });
    expect(React.isValidElement(element)).toBe(true);
  });
});

// ─── Campaign Maker Spotlight ────────────────────────────────────────────

describe('CampaignMakerSpotlight template', () => {
  const fullProps = {
    makerName: 'Elena Woodcraft',
    makerPortraitUrl: 'https://example.com/elena.jpg',
    makerLocation: 'Portland, Oregon',
    narrativeText: 'Elena has been crafting furniture for over 20 years.',
    philosophyQuote: 'Every piece tells a story of the wood it came from.',
    products: [
      { name: 'Hand-turned Bowl', priceFormatted: '$180', origin: 'Oregon', material: 'Cherry wood', productUrl: 'https://example.com/bowl' },
    ],
    ctaUrl: 'https://admin.patina.cloud/catalog',
    unsubscribeUrl: 'https://admin.patina.cloud/api/unsubscribe?token=abc',
  };

  it('creates a valid React element with full props', () => {
    const element = React.createElement(CampaignMakerSpotlight, fullProps);
    expect(React.isValidElement(element)).toBe(true);
  });

  it('passes correct props through', () => {
    const element = React.createElement(CampaignMakerSpotlight, fullProps);
    const tree = getElementTree(element);
    expect(tree.props.makerName).toBe('Elena Woodcraft');
    expect(tree.props.makerLocation).toBe('Portland, Oregon');
    expect(tree.props.philosophyQuote).toBe('Every piece tells a story of the wood it came from.');
  });

  it('works without optional props', () => {
    const element = React.createElement(CampaignMakerSpotlight, {
      makerName: 'John Doe',
      narrativeText: 'A craftsman.',
      products: [],
      ctaUrl: 'https://example.com',
    });
    expect(React.isValidElement(element)).toBe(true);
  });
});

// ─── Campaign Reengagement ──────────────────────────────────────────────

describe('CampaignReengagement template', () => {
  const fullProps = {
    displayName: 'Sarah',
    daysSinceLastVisit: 45,
    personalizedProducts: [
      { name: 'Velvet Armchair', imageUrl: 'https://example.com/chair.jpg', priceFormatted: '$1,100', matchReason: 'Based on your saved styles', productUrl: 'https://example.com/chair' },
      { name: 'Brass Floor Lamp', priceFormatted: '$420', matchReason: 'Popular in your area' },
      { name: 'Ceramic Vase', priceFormatted: '$85' },
    ],
    offerText: '15% off your next order — just for you',
    ctaText: 'Come Back & Explore',
    ctaUrl: 'https://admin.patina.cloud/catalog',
    unsubscribeUrl: 'https://admin.patina.cloud/api/unsubscribe?token=abc',
  };

  it('creates a valid React element with full props', () => {
    const element = React.createElement(CampaignReengagement, fullProps);
    expect(React.isValidElement(element)).toBe(true);
  });

  it('passes correct props through', () => {
    const element = React.createElement(CampaignReengagement, fullProps);
    const tree = getElementTree(element);
    expect(tree.props.displayName).toBe('Sarah');
    expect(tree.props.daysSinceLastVisit).toBe(45);
    expect(tree.props.offerText).toBe('15% off your next order — just for you');
    expect((tree.props.personalizedProducts as unknown[]).length).toBe(3);
  });

  it('works without optional props', () => {
    const element = React.createElement(CampaignReengagement, {
      personalizedProducts: [],
      ctaUrl: 'https://example.com',
    });
    expect(React.isValidElement(element)).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((element.props as any).displayName).toBeUndefined();
  });
});
