import { render, screen } from '@testing-library/react';

import { ProjectApprovalDocumentMount } from '../project-approval-document-mount';

jest.mock('../approvals/project-approval-document', () => ({
  ProjectApprovalDocument: (props: {
    projectId: string;
    clientProfileId: string | null;
    phases: Array<{ id: string; name: string; status: string }>;
  }) => (
    <div data-testid="project-approval-mount">
      {props.projectId} · {props.clientProfileId ?? 'no-client'} ·{' '}
      {props.phases.map((phase) => `${phase.id}:${phase.status}`).join(',')}
    </div>
  ),
}));

describe('ProjectApprovalDocumentMount', () => {
  it('mounts one project approval surface with exact project authority inputs', () => {
    render(
      <ProjectApprovalDocumentMount
        projectId="project-1"
        clientProfileId="client-1"
        phases={[
          {
            id: 'phase-1',
            name: 'Design development',
            status: 'in_progress',
          },
        ]}
      />,
    );

    expect(screen.getByTestId('project-approval-mount')).toHaveTextContent(
      'project-1 · client-1 · phase-1:in_progress',
    );
  });

  it('mounts nothing outside a project document', () => {
    const { container } = render(
      <ProjectApprovalDocumentMount
        projectId={null}
        clientProfileId="proposal-client"
        phases={[]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
