/** CPUX-01: what this page is for, under the doorplate and above the hero. */
export const ARRIVAL_SENTENCE = 'Pay invoices, review approvals, and follow your project here.';

export function ArrivalLine({ sentence = ARRIVAL_SENTENCE }: { sentence?: string }) {
  return <p className="ed-arrival">{sentence}</p>;
}
