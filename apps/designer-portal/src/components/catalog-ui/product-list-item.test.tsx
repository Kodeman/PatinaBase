import { render, screen } from '@testing-library/react';
import { ProductListItem } from '../../../../../packages/catalog-ui/src/components/product-list-item';

describe('ProductListItem', () => {
  it('labels a missing thumbnail as no image', () => {
    render(<ProductListItem id="product-1" name="Oak chair" price={1200} />);

    expect(screen.getByText('No image')).toBeInTheDocument();
  });
});
