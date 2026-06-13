/**
 * R33 F6 CI contract — R16 extended to senders: "MESSAGE · DESIGNER USER"
 * is the USER-bug's third cousin. Sender labels always render profile
 * display names; a production guard falls back to the STUDIO name, never a
 * role noun. Held source-level (the R3 shadow-lint / R26 mirror-contract
 * precedent), plus the F1 own-voice line: studio-authored posts are
 * pre-settled and excluded from unread derivation.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const LIB = join(__dirname, '..');
const MIGRATIONS = join(__dirname, '..', '..', '..', '..', '..', '..', 'supabase', 'migrations');

const derivationSource = readFileSync(join(LIB, 'margin-derivation.ts'), 'utf8');
const viewSource = readFileSync(
  join(MIGRATIONS, '00206_margin_own_voice_and_milestone_cron.sql'),
  'utf8',
);

describe('sender labels (R16 → senders, R33 F6)', () => {
  it('the view renders display names with a studio-name fallback for the studio side', () => {
    // The guard: a nameless studio sender wears the studio's name…
    expect(viewSource).toMatch(/coalesce\(nullif\(btrim\(p\.full_name\), ''\), st\.studio_name\)/);
    // …resolved from the engagement designer's design_studio membership.
    expect(viewSource).toMatch(/o\.type = 'design_studio'/);
    // A nameless client/vendor sender stays null — never a substitute name.
    expect(viewSource).toMatch(/else nullif\(btrim\(p\.full_name\), ''\)/);
  });

  it('the kind line never invents a role noun for a missing sender', () => {
    // The message case renders the payload name or plain "Message" — no
    // 'Designer'/'Client'/'Vendor'/'User' literals anywhere in derivation.
    expect(derivationSource).not.toMatch(/['"`](Designer|Client|Vendor|Admin)( User)?['"`]/);
    expect(derivationSource).toMatch(/sender \? `Message · \$\{sender\}` : 'Message'/);
  });
});

describe('own voice (R33 F1)', () => {
  it('the view excludes studio-authored latest posts from unread derivation', () => {
    expect(viewSource).toMatch(/when m\.own_voice then 'read'/);
    expect(viewSource).toMatch(/'own_voice', m\.own_voice/);
    // Studio-authored = NOT a client/vendor participant (system = studio).
    expect(viewSource).toMatch(/sp\.role in \('client', 'vendor'\)/);
  });

  it('derivation sinks own-voice threads into the Settled fold', () => {
    expect(derivationSource).toMatch(
      /row\.kind === 'message' && row\.payload\.own_voice === true/,
    );
  });
});
