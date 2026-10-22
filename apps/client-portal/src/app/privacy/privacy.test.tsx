import { render, screen, within } from '@testing-library/react';

import PrivacyPage from './page';

it('renders the seven privacy sections, their disclosures and no prohibited wording', () => {
  const { container } = render(<PrivacyPage />);

  expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toHaveClass('t-d1');
  expect(screen.getByText('Your project record')).toHaveClass('t-head');
  expect(container.querySelector('article')).toHaveClass('t-body', 'max-w-2xl');
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();

  const sections = [
    ['Your project page', 'prepared by your studio and printed by Patina'],
    ['What Patina keeps', 'items, rooms, dates, the studio’s photographs and drawings, and invoices'],
    ['What goes to the composing service', 'Everything listed below is sent to the Anthropic API, which composes the page.'],
    ['What stays out', 'These are never sent:'],
    ['Where the pictures live', 'private copies stored on Cloudflare'],
    ['Ask for removal', 'contact on your project page’s letterhead'],
    ['About this notice', 'This page will be reviewed by counsel; until then it describes what the software does.'],
  ];
  expect(container.querySelectorAll('section')).toHaveLength(7);
  for (const [name, copy] of sections) {
    const heading = screen.getByRole('heading', { level: 2, name });
    const section = heading.closest('section')!;
    expect(section).toHaveAccessibleName(name);
    expect(section).toHaveTextContent(copy);
  }

  const composition = screen.getByRole('region', { name: 'What goes to the composing service' });
  expect(within(composition).getAllByRole('list')).toHaveLength(1);
  expect(within(composition).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'Item names as your studio signed them',
    'What kind of piece each item is, and how far along it is',
    'Descriptions and dimensions as signed',
    'Materials and finishes',
    'Room names',
    'The project phase and dates',
    'Palette names',
    'Maker name and where each piece is made, when your studio turns that on',
    'Photographs of the specified pieces',
    'Renderings your studio makes of your rooms',
    'Photographs taken in your home — room scans and photographs after installation',
  ]);
  const imageUse = within(composition).getByText('They are never used to make a picture of your home that does not exist.');
  expect(imageUse.tagName).toBe('P');
  expect(imageUse.previousElementSibling).toBe(within(composition).getByRole('list'));
  const keptOut = screen.getByRole('region', { name: 'What stays out' });
  expect(within(keptOut).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'Your address',
    'The names of the people in your household',
    'The project’s name',
    'Prices',
    'Your studio’s private notes',
    'Drawing sheets and their titles',
    'Boards and their names',
  ]);
  expect(within(keptOut).getAllByText('These are never sent:')).toHaveLength(1);
  expect(keptOut.querySelectorAll('p')).toHaveLength(1);
  const pictures = screen.getByRole('region', { name: 'Where the pictures live' });
  expect(pictures).toHaveTextContent('served only to signed-in members of your project and cached for an hour');
  expect(within(screen.getByRole('region', { name: 'Ask for removal' }))
    .getByRole('link', { name: 'hello@patina.cloud' })).toHaveAttribute('href', 'mailto:hello@patina.cloud');
  expect(container.querySelector('time')).toHaveAttribute('dateTime', '2026-10-21');
  expect(container.querySelector('time')).toHaveTextContent('21 October 2026');
  expect(container.textContent?.match(/Anthropic/g)).toHaveLength(1);
  expect(container.textContent).not.toMatch(/\bAI\b|generated|artificial intelligence|Claude|Sonnet|Opus|Haiku|GPT|allowlist|V2-5|perception/i);
});
