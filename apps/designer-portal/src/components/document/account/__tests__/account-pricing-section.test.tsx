/**
 * US-37 #4: the account page's Pricing section. The designer's default
 * markup (35 until set) and one each for freight, delivery and install, saved
 * through set_my_pricing_settings.
 */
import { fireEvent, render, screen } from '@testing-library/react';

const mockSave = jest.fn();
const mockSettings: { data: unknown } = { data: undefined };

jest.mock('@patina/supabase', () => ({
  usePricingSettings: () => ({ data: mockSettings.data }),
  useSetPricingSettings: () => ({ mutate: mockSave, isPending: false, error: null }),
}));
jest.mock('../../document-action', () => ({
  DocumentAction: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));
jest.mock('@/components/feedback/act-fail-line', () => ({ ActFailLine: () => null }));

import { AccountPricingSection } from '../account-pricing-section';

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings.data = undefined;
});

describe('AccountPricingSection', () => {
  it('reads 35 for every kind until the designer sets one', () => {
    render(<AccountPricingSection />);
    expect(screen.getByRole('heading', { name: 'Pricing' })).toBeInTheDocument();
    for (const label of [
      'Default markup %',
      'Freight markup %',
      'Delivery markup %',
      'Install markup %',
    ]) {
      expect(screen.getByLabelText(label)).toHaveValue('35');
    }
  });

  it('prints the saved defaults and saves every kind', () => {
    mockSettings.data = {
      defaultMarkupPercent: 40,
      freightMarkupPercent: 20,
      deliveryMarkupPercent: 15,
      installMarkupPercent: 30,
      isDefault: false,
      updatedAt: null,
    };
    render(<AccountPricingSection />);
    expect(screen.getByLabelText('Freight markup %')).toHaveValue('20');
    fireEvent.change(screen.getByLabelText('Default markup %'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save pricing' }));
    expect(mockSave).toHaveBeenCalledWith(
      {
        defaultMarkupPercent: 45,
        freightMarkupPercent: 20,
        deliveryMarkupPercent: 15,
        installMarkupPercent: 30,
      },
      expect.anything(),
    );
  });

  it('refuses a markup that is not a number, and sends nothing', () => {
    render(<AccountPricingSection />);
    fireEvent.change(screen.getByLabelText('Install markup %'), { target: { value: 'lots' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save pricing' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Install markup is a number from 0 to 1000.',
    );
    expect(mockSave).not.toHaveBeenCalled();
  });
});
