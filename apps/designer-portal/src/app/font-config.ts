type FontDefinition = { variable: string };

const remoteFontsDisabled =
  process.env.DISABLE_REMOTE_FONTS === '1' || process.env.NEXT_PUBLIC_DISABLE_REMOTE_FONTS === '1';

let inter: FontDefinition = { variable: '' };
let playfair: FontDefinition = { variable: '' };

if (!remoteFontsDisabled) {
  try {
    const { Inter, Playfair_Display } = await import('next/font/google');

    inter = Inter({
      subsets: ['latin'],
      variable: '--font-inter',
      display: 'swap',
    });

    playfair = Playfair_Display({
      subsets: ['latin'],
      variable: '--font-heading',
      display: 'swap',
    });
  } catch (error) {
    console.warn('[font-config] Falling back to system fonts:', error);
  }
}

export { inter, playfair };
