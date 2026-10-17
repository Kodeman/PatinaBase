import { render, screen } from '@testing-library/react';
import { PromoteToStudioModal } from '../promote-to-studio-modal';

jest.mock('@patina/supabase', () => ({
  useProduct: () => ({ data: { id: 'product-1' } }),
  useVendor: () => ({ data: { id: 'vendor-1' } }),
  useOrganizations: () => ({ data: [{ id: 'studio-1', type: 'design_studio', membership: { role: 'owner' }, name: 'Studio' }] }),
  usePromoteToStudio: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/components/document/rooms/room-sheet', () => ({ RoomSheet: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('@/components/ui/controls', () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
  IconButton: ({ children, label, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) => <button aria-label={label} {...props}>{children}</button>,
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));
jest.mock('@patina/catalog-ui', () => ({
  PrefilledInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  PrefilledChip: () => null,
  LayerChip: () => null,
}));

it('associates field labels with their form controls', () => {
  render(<PromoteToStudioModal open productId="product-1" onClose={jest.fn()} asSheet />);

  expect(screen.getByLabelText('Lead time (weeks, optional)')).toHaveProperty('tagName', 'INPUT');
  expect(screen.getByLabelText(/Studio/)).toHaveProperty('tagName', 'SELECT');
  expect(screen.getByLabelText(/Payment terms/i)).toHaveProperty('tagName', 'SELECT');
});
