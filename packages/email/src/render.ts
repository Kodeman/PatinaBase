import { render } from '@react-email/render';
import type { ReactElement } from 'react';

export function renderEmailHtml(element: ReactElement): Promise<string> {
  return render(element);
}
