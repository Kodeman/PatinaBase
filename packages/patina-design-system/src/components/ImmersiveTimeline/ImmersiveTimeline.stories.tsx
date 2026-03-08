import type { Meta, StoryObj } from '@storybook/react'
import { ImmersiveTimeline } from './ImmersiveTimeline'
import { TimelineSegmentData } from './TimelineSegment'
import { LazyImage } from './LazyImage'
import { ProgressiveContent } from './ProgressiveContent'

const meta: Meta<typeof ImmersiveTimeline> = {
  title: 'Components/ImmersiveTimeline',
  component: ImmersiveTimeline,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof ImmersiveTimeline>

// Sample timeline data
const projectSegments: TimelineSegmentData[] = [
  {
    id: '1',
    type: 'milestone',
    status: 'completed',
    title: 'Project Discovery',
    description: 'Initial consultation and style profile assessment completed.',
    date: new Date('2024-01-15'),
    metadata: {
      expandable: true,
    },
  },
  {
    id: '2',
    type: 'milestone',
    status: 'completed',
    title: 'Design Concept Approval',
    description: 'Client approved the modern minimalist design direction with warm accents.',
    date: new Date('2024-02-01'),
  },
  {
    id: '3',
    type: 'task',
    status: 'completed',
    title: 'Material Selection',
    description: 'Finalized wood finishes, fabrics, and color palette.',
    date: new Date('2024-02-15'),
  },
  {
    id: '4',
    type: 'approval',
    status: 'active',
    title: 'Furniture Procurement',
    description: 'Awaiting client approval on final furniture selections and pricing.',
    date: new Date('2024-03-01'),
    metadata: {
      expandable: true,
    },
  },
  {
    id: '5',
    type: 'task',
    status: 'upcoming',
    title: 'Installation Planning',
    description: 'Coordinate delivery schedules and installation timeline.',
  },
  {
    id: '6',
    type: 'milestone',
    status: 'upcoming',
    title: 'Installation & Styling',
    description: 'Professional installation of all furniture and decor elements.',
  },
  {
    id: '7',
    type: 'milestone',
    status: 'upcoming',
    title: 'Final Reveal',
    description: 'Complete walkthrough and final styling touches.',
  },
]

export const Default: Story = {
  args: {
    segments: projectSegments,
    showProgress: true,
    enableKeyboardNav: true,
    layout: 'default',
    spacing: 'comfortable',
    segmentSize: 'standard',
  },
}

export const WideLayout: Story = {
  args: {
    segments: projectSegments,
    showProgress: true,
    progressPosition: 'fixed-left',
    layout: 'wide',
    spacing: 'spacious',
    segmentSize: 'standard',
  },
}

export const CompactLayout: Story = {
  args: {
    segments: projectSegments,
    showProgress: true,
    layout: 'default',
    spacing: 'compact',
    segmentSize: 'compact',
  },
}

export const WithCustomContent: Story = {
  args: {
    segments: projectSegments,
    showProgress: true,
    layout: 'wide',
    renderSegment: (segment) => (
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center ${
              segment.status === 'completed'
                ? 'bg-emerald-500 text-white'
                : segment.status === 'active'
                ? 'bg-indigo-500 text-white'
                : 'bg-slate-200 text-slate-500'
            }`}
          >
            {segment.status === 'completed' ? '✓' : segment.status === 'active' ? '◉' : '○'}
          </div>
          <div>
            <h3 className="text-xl font-bold">{segment.title}</h3>
            <p className="text-sm text-slate-600">{segment.description}</p>
          </div>
        </div>

        {segment.metadata?.expandable && segment.status === 'active' && (
          <ProgressiveContent loadingStrategy="viewport" minHeight={200}>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <LazyImage
                src="https://picsum.photos/400/300?random=1"
                alt="Design sample 1"
                aspectRatio={4 / 3}
                className="rounded-lg"
              />
              <LazyImage
                src="https://picsum.photos/400/300?random=2"
                alt="Design sample 2"
                aspectRatio={4 / 3}
                className="rounded-lg"
              />
              <LazyImage
                src="https://picsum.photos/400/300?random=3"
                alt="Design sample 3"
                aspectRatio={4 / 3}
                className="rounded-lg"
              />
            </div>
          </ProgressiveContent>
        )}
      </div>
    ),
  },
}

export const LongTimeline: Story = {
  args: {
    segments: Array.from({ length: 20 }, (_, i) => ({
      id: `segment-${i}`,
      type: i % 3 === 0 ? 'milestone' : i % 3 === 1 ? 'task' : 'approval',
      status:
        i < 8 ? 'completed' : i === 8 ? 'active' : i > 15 ? 'blocked' : 'upcoming',
      title: `Timeline Event ${i + 1}`,
      description: `Description for timeline event ${i + 1}`,
      date: i < 10 ? new Date(2024, 0, i * 3 + 1) : undefined,
    } as TimelineSegmentData)),
    showProgress: true,
    enableKeyboardNav: true,
    layout: 'default',
  },
}

export const NoProgress: Story = {
  args: {
    segments: projectSegments.slice(0, 4),
    showProgress: false,
    enableKeyboardNav: false,
    layout: 'default',
  },
}

export const HeroSize: Story = {
  args: {
    segments: projectSegments.slice(0, 5),
    showProgress: true,
    layout: 'wide',
    spacing: 'spacious',
    segmentSize: 'hero',
  },
}
