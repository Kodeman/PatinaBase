import { notFound } from 'next/navigation';
import { ProjectTimeline } from '@/components/timeline/ProjectTimeline';

interface PageProps {
  params: {
    id: string;
  };
}

// Mock function to simulate fetching project data
async function getProject(id: string) {
  // In a real implementation, this would call the API
  // For now, return mock data
  const mockProject = {
    id,
    name: 'Living Room Redesign',
    description: 'Complete interior redesign of main living space',
    milestones: [
      {
        id: '1',
        title: 'Design Approval',
        description: 'Initial design concepts approved',
        date: '2025-01-15',
        status: 'completed',
        details: 'Client reviewed and approved all initial design concepts including color schemes, furniture selections, and layout proposals.',
      },
      {
        id: '2',
        title: 'Material Selection',
        description: 'Fabrics and materials chosen',
        date: '2025-02-01',
        status: 'in-progress',
        details: 'Currently working with vendors to finalize fabric selections and material samples. Awaiting client approval on final choices.',
      },
      {
        id: '3',
        title: 'Procurement',
        description: 'Order placement and tracking',
        date: '2025-02-15',
        status: 'upcoming',
        details: 'Will begin ordering approved materials and furniture once selections are finalized.',
      },
      {
        id: '4',
        title: 'Installation',
        description: 'On-site installation and setup',
        date: '2025-03-01',
        status: 'upcoming',
        details: 'Professional installation team will handle all furniture placement and final styling.',
      },
    ],
  };

  return mockProject;
}

export default async function ProjectTimelinePage({ params }: PageProps) {
  const project = await getProject(params.id);

  if (!project) {
    notFound();
  }

  return (
    <div className="timeline-page">
      <ProjectTimeline project={project} />
    </div>
  );
}

export const metadata = {
  title: 'Project Timeline - Patina Designer Portal',
  description: 'Track your project milestones and progress',
};