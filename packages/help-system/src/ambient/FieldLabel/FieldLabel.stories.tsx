import type { Meta, StoryObj } from '@storybook/react'
import { FieldLabel } from './FieldLabel'

/**
 * Stories for `<FieldLabel />` — Layer 1 Ambient component.
 * Spec: §4.4 of `docs/prds/Guide/patina-help-guidance-engineering-handoff.md`.
 */
const meta = {
  title: 'help-system/ambient/FieldLabel',
  component: FieldLabel,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The small caps label that sits above a form field. Pure presentational ' +
          'component — does NOT fetch from Sanity or emit analytics. Composes with a ' +
          'trailing `<InfoIcon />` (passed as a child) when an explainer is warranted.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    htmlFor: {
      control: 'text',
      description: 'The id of the input this label is bound to.',
    },
    required: {
      control: 'boolean',
      description:
        'When true, append a Terracotta asterisk marker. Visual only — the ' +
        'parent input owns the aria-required semantics.',
    },
    optional: {
      control: 'boolean',
      description:
        'When true, append a muted "(optional)" marker. Mutually exclusive with ' +
        '`required` — if both are set, `required` wins.',
    },
    children: {
      control: 'text',
      description: 'Label content. Plain text or a fragment that may include a trailing icon slot.',
    },
    className: {
      control: 'text',
      description: 'Extra Tailwind classes (rarely needed — defaults satisfy spec §4.4).',
    },
  },
} satisfies Meta<typeof FieldLabel>

export default meta
type Story = StoryObj<typeof meta>

// ─── Stories ──────────────────────────────────────────────────────────────────

/**
 * Default — a plain field label with no markers. The most common usage.
 */
export const Default: Story = {
  args: {
    htmlFor: 'project-name',
    children: 'Project name',
  },
  render: (args) => (
    <div className="flex flex-col gap-2 min-w-[280px]">
      <FieldLabel {...args} />
      <input
        id={args.htmlFor}
        type="text"
        placeholder="Chen Residence — Living & Dining"
        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </div>
  ),
}

/**
 * Required — appends the Terracotta asterisk marker. The asterisk is `aria-hidden`,
 * so the parent input still needs `required` / `aria-required` for assistive tech.
 */
export const Required: Story = {
  args: {
    htmlFor: 'project-name-required',
    required: true,
    children: 'Project name',
  },
  render: (args) => (
    <div className="flex flex-col gap-2 min-w-[280px]">
      <FieldLabel {...args} />
      <input
        id={args.htmlFor}
        type="text"
        required
        aria-required="true"
        placeholder="Chen Residence — Living & Dining"
        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </div>
  ),
}

/**
 * Optional — appends the italic "(optional)" marker. Used when fields are
 * common but not strictly required for submission.
 */
export const Optional: Story = {
  args: {
    htmlFor: 'kickoff-notes',
    optional: true,
    children: 'Kickoff notes',
  },
  render: (args) => (
    <div className="flex flex-col gap-2 min-w-[280px]">
      <FieldLabel {...args} />
      <textarea
        id={args.htmlFor}
        placeholder="Anything the team should know before kickoff?"
        rows={3}
        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </div>
  ),
}

/**
 * Composes with a trailing icon slot — the spec pattern at handoff-md line 213:
 *
 *     <FieldLabel>Aesthete Score <InfoIcon surfaceKey="…" /></FieldLabel>
 *
 * This story uses a tiny placeholder icon so the slot pattern is visible without
 * pulling in the real `<InfoIcon />` (which ships in Stream C).
 */
export const WithInfoIconSlot: Story = {
  args: {
    htmlFor: 'aesthete-score',
    children: undefined, // overridden via render
  },
  render: (args) => {
    const InfoIconPlaceholder = () => (
      <span
        aria-label="More info"
        role="img"
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current text-[0.55rem] leading-none normal-case"
      >
        i
      </span>
    )
    return (
      <div className="flex flex-col gap-2 min-w-[280px]">
        <FieldLabel {...args}>
          Aesthete Score
          <InfoIconPlaceholder />
        </FieldLabel>
        <input
          id={args.htmlFor}
          type="number"
          defaultValue={7.4}
          step={0.1}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
    )
  },
}
