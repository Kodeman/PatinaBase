import type {
  ContentBlockType,
  HeaderBlockProps,
  HeroBlockProps,
  TextBlockProps,
  DividerBlockProps,
  ProductCardProps,
  ProductGridProps,
  CtaButtonProps,
  NotificationBlockProps,
  MakerSpotlightProps,
  FooterBlockProps,
} from '../types/notifications';

type BlockPropsMap = {
  header: HeaderBlockProps;
  hero: HeroBlockProps;
  text_block: TextBlockProps;
  divider: DividerBlockProps;
  product_card: ProductCardProps;
  product_grid: ProductGridProps;
  cta_button: CtaButtonProps;
  notification: NotificationBlockProps;
  maker_spotlight: MakerSpotlightProps;
  footer: FooterBlockProps;
};

const defaults: BlockPropsMap = {
  header: {
    tagline: 'Furniture Intelligence',
  },
  hero: {
    greeting: 'Hello {{first_name}},',
    headline: 'Your Weekly Design Brief',
    subline: 'Curated selections matched to your aesthetic profile.',
  },
  text_block: {
    text: 'Enter your text here...',
    align: 'left',
  },
  divider: {
    variant: 'subtle',
  },
  product_card: {
    image_url: '',
    provenance: 'Italian Craftsmanship',
    product_name: 'Product Name',
    description: 'A brief description of this piece and its unique qualities.',
    price: '$0,000',
    style_match: '92% Match',
    product_url: '#',
  },
  product_grid: {
    products: [
      {
        image_url: '',
        provenance: 'Italian Craftsmanship',
        product_name: 'Product One',
        description: 'Brief description of this piece.',
        price: '$0,000',
        style_match: '92% Match',
        product_url: '#',
      },
      {
        image_url: '',
        provenance: 'French Atelier',
        product_name: 'Product Two',
        description: 'Brief description of this piece.',
        price: '$0,000',
        style_match: '88% Match',
        product_url: '#',
      },
    ],
  },
  cta_button: {
    text: 'Explore Collection',
    url: '#',
    supporting_text: 'Discover pieces selected for your style profile.',
    variant: 'primary',
  },
  notification: {
    badge_label: 'Update',
    headline: 'Notification Headline',
    body: 'A brief message about this notification.',
    details: [
      { key: 'Detail', value: 'Value' },
    ],
    cta_text: 'View Details',
    cta_url: '#',
  },
  maker_spotlight: {
    portrait_url: '',
    maker_name: 'Artisan Name',
    story: 'Share the story of this maker and their craft tradition.',
    link_text: 'Explore Their Collection',
    link_url: '#',
  },
  footer: {
    nav_links: [
      { label: 'Portfolio', url: '#' },
      { label: 'Catalog', url: '#' },
      { label: 'Account', url: '#' },
    ],
    compliance_text: 'You received this because you\'re part of the Patina design network. Manage preferences or unsubscribe.',
  },
};

export function getDefaultProps<T extends ContentBlockType>(type: T): BlockPropsMap[T] {
  return { ...defaults[type] };
}
