/**
 * The People Room view contract (frozen by Wave 0).
 *
 * The Room is a left-rail of Strata-ruled VIEWS over the unified directory.
 * Each view is a slot component; the tracks own their slots and receive this
 * stable navigation contract. Do not widen without coordinating — B/C/D import
 * these types.
 */

import type { PartyRole } from '@patina/supabase';

export type PeopleView =
  | 'directory'
  | 'threads'
  | 'nurture'
  | 'reviews'
  | 'portfolio'
  | 'outreach';

/** The navigation contract every view receives. */
export interface PeopleViewProps {
  /** Open a person's role-adaptive profile (Track B). */
  openPerson: (personId: string, role: PartyRole) => void;
  /** Open a thread conversation in the Threads view (Track C). */
  openThread: (threadId: string) => void;
  /** Switch the active left-rail view. */
  goView: (view: PeopleView) => void;
  /** A quiet toast at the foot of the Room. */
  notify: (message: string) => void;
}

/** Track C's Threads view also reads a pending thread id (set when "Message"
 *  is pressed from a profile). */
export interface ThreadsViewProps extends PeopleViewProps {
  pendingThreadId?: string | null;
}

/** Track B's role-adaptive Person Profile. */
export interface PersonProfileProps extends PeopleViewProps {
  personId: string;
  role: PartyRole;
  onBack: () => void;
}
