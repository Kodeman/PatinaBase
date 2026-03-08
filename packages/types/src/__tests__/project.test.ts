/**
 * Project Types Validation Tests
 * Tests type structure for projects, tasks, RFIs, milestones, and related entities
 */

import {
  Project,
  ProjectStatus,
  Task,
  TaskStatus,
  TaskPriority,
  RFI,
  RFIStatus,
  ChangeOrder,
  ChangeOrderStatus,
  Issue,
  IssueStatus,
  IssueSeverity,
  DailyLog,
  ProjectDocument,
  Milestone,
  CreateProjectDTO,
  CreateTaskDTO,
  ProjectWithDetails,
} from '../project';

describe('Project Types', () => {
  describe('Project interface', () => {
    it('should validate project with all mandatory fields', () => {
      const project: Project = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Modern Home Renovation',
        clientId: '123e4567-e89b-12d3-a456-426614174001',
        designerId: '123e4567-e89b-12d3-a456-426614174002',
        status: 'active',
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(project.title).toBe('Modern Home Renovation');
      expect(project.status).toBe('active');
      expect(project.currency).toBe('USD');
    });

    it('should support all ProjectStatus values', () => {
      const statuses: ProjectStatus[] = ['draft', 'active', 'substantial_completion', 'closed'];

      statuses.forEach((status) => {
        const project: Partial<Project> = { status };
        expect(project.status).toBe(status);
      });
    });

    it('should support optional fields', () => {
      const project: Project = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        proposalId: '123e4567-e89b-12d3-a456-426614174003',
        title: 'Kitchen Remodel',
        clientId: '123e4567-e89b-12d3-a456-426614174001',
        designerId: '123e4567-e89b-12d3-a456-426614174002',
        status: 'active',
        startDate: new Date('2024-01-15'),
        endDate: new Date('2024-06-30'),
        budget: 50000,
        currency: 'USD',
        description: 'Complete kitchen renovation with custom cabinets',
        metadata: { roomSize: '15x12', contractor: 'ABC Construction' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(project.proposalId).toBeDefined();
      expect(project.budget).toBe(50000);
      expect(project.description).toContain('kitchen');
      expect(project.metadata?.contractor).toBe('ABC Construction');
    });

    it('should track project completion', () => {
      const project: Partial<Project> = {
        status: 'substantial_completion',
        endDate: new Date('2024-06-30'),
        actualEnd: new Date('2024-07-15'),
      };

      // Project went over schedule
      expect(project.actualEnd!.getTime()).toBeGreaterThan(project.endDate!.getTime());
    });
  });

  describe('Task interface', () => {
    it('should validate task with all mandatory fields', () => {
      const task: Task = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        title: 'Install kitchen cabinets',
        status: 'todo',
        priority: 'high',
        order: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(task.title).toBe('Install kitchen cabinets');
      expect(task.status).toBe('todo');
      expect(task.priority).toBe('high');
    });

    it('should support all TaskStatus values', () => {
      const statuses: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'];

      statuses.forEach((status) => {
        const task: Partial<Task> = { status };
        expect(task.status).toBe(status);
      });
    });

    it('should support all TaskPriority values', () => {
      const priorities: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

      priorities.forEach((priority) => {
        const task: Partial<Task> = { priority };
        expect(task.priority).toBe(priority);
      });
    });

    it('should track task completion', () => {
      const task: Partial<Task> = {
        status: 'done',
        completedAt: new Date(),
      };

      expect(task.status).toBe('done');
      expect(task.completedAt).toBeDefined();
    });

    it('should support task assignment and due dates', () => {
      const task: Partial<Task> = {
        assigneeId: '123e4567-e89b-12d3-a456-426614174000',
        dueDate: new Date('2024-03-15'),
      };

      expect(task.assigneeId).toBeDefined();
      expect(task.dueDate).toBeInstanceOf(Date);
    });
  });

  describe('RFI interface', () => {
    it('should validate RFI with all mandatory fields', () => {
      const rfi: RFI = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        title: 'Cabinet Hardware Specifications',
        question: 'Which hardware finish should we use for the kitchen cabinets?',
        requestedBy: '123e4567-e89b-12d3-a456-426614174002',
        status: 'open',
        priority: 'normal',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(rfi.title).toBeDefined();
      expect(rfi.question).toBeDefined();
      expect(rfi.status).toBe('open');
    });

    it('should support all RFIStatus values', () => {
      const statuses: RFIStatus[] = ['open', 'answered', 'closed', 'cancelled'];

      statuses.forEach((status) => {
        const rfi: Partial<RFI> = { status };
        expect(rfi.status).toBe(status);
      });
    });

    it('should support RFI priority levels', () => {
      const normalRFI: Partial<RFI> = {
        priority: 'normal',
      };

      const urgentRFI: Partial<RFI> = {
        priority: 'urgent',
      };

      expect(normalRFI.priority).toBe('normal');
      expect(urgentRFI.priority).toBe('urgent');
    });

    it('should track RFI answers', () => {
      const rfi: Partial<RFI> = {
        status: 'answered',
        answer: 'Use brushed nickel finish for all cabinet hardware',
        answeredAt: new Date(),
      };

      expect(rfi.status).toBe('answered');
      expect(rfi.answer).toBeDefined();
      expect(rfi.answeredAt).toBeDefined();
    });

    it('should support RFI assignment', () => {
      const rfi: Partial<RFI> = {
        assignedTo: '123e4567-e89b-12d3-a456-426614174000',
        dueDate: new Date('2024-03-01'),
      };

      expect(rfi.assignedTo).toBeDefined();
      expect(rfi.dueDate).toBeInstanceOf(Date);
    });
  });

  describe('ChangeOrder interface', () => {
    it('should validate change order with all mandatory fields', () => {
      const changeOrder: ChangeOrder = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        title: 'Add Under-Cabinet Lighting',
        description: 'Client requested to add LED under-cabinet lighting to the kitchen',
        requestedBy: '123e4567-e89b-12d3-a456-426614174002',
        status: 'submitted',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(changeOrder.title).toBeDefined();
      expect(changeOrder.description).toBeDefined();
      expect(changeOrder.status).toBe('submitted');
    });

    it('should support all ChangeOrderStatus values', () => {
      const statuses: ChangeOrderStatus[] = [
        'draft',
        'submitted',
        'approved',
        'rejected',
        'implemented',
      ];

      statuses.forEach((status) => {
        const changeOrder: Partial<ChangeOrder> = { status };
        expect(changeOrder.status).toBe(status);
      });
    });

    it('should track cost and schedule impact', () => {
      const changeOrder: Partial<ChangeOrder> = {
        costImpact: 2500,
        scheduleImpact: 5, // 5 days delay
      };

      expect(changeOrder.costImpact).toBe(2500);
      expect(changeOrder.scheduleImpact).toBe(5);
    });

    it('should track approval', () => {
      const changeOrder: Partial<ChangeOrder> = {
        status: 'approved',
        approvedBy: '123e4567-e89b-12d3-a456-426614174000',
        approvedAt: new Date(),
      };

      expect(changeOrder.status).toBe('approved');
      expect(changeOrder.approvedBy).toBeDefined();
      expect(changeOrder.approvedAt).toBeDefined();
    });

    it('should track rejection with reason', () => {
      const changeOrder: Partial<ChangeOrder> = {
        status: 'rejected',
        reason: 'Cost exceeds budget allowance',
      };

      expect(changeOrder.status).toBe('rejected');
      expect(changeOrder.reason).toBeDefined();
    });
  });

  describe('Issue interface', () => {
    it('should validate issue with all mandatory fields', () => {
      const issue: Issue = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        title: 'Cabinet alignment issue',
        description: 'Upper cabinets are not level on the west wall',
        reportedBy: '123e4567-e89b-12d3-a456-426614174002',
        severity: 'high',
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(issue.title).toBeDefined();
      expect(issue.description).toBeDefined();
      expect(issue.severity).toBe('high');
      expect(issue.status).toBe('open');
    });

    it('should support all IssueStatus values', () => {
      const statuses: IssueStatus[] = ['open', 'investigating', 'resolved', 'closed', 'wont_fix'];

      statuses.forEach((status) => {
        const issue: Partial<Issue> = { status };
        expect(issue.status).toBe(status);
      });
    });

    it('should support all IssueSeverity values', () => {
      const severities: IssueSeverity[] = ['low', 'medium', 'high', 'critical'];

      severities.forEach((severity) => {
        const issue: Partial<Issue> = { severity };
        expect(issue.severity).toBe(severity);
      });
    });

    it('should track issue resolution', () => {
      const issue: Partial<Issue> = {
        status: 'resolved',
        resolution: 'Cabinets were shimmed and re-leveled. Verified with laser level.',
        resolvedAt: new Date(),
      };

      expect(issue.status).toBe('resolved');
      expect(issue.resolution).toBeDefined();
      expect(issue.resolvedAt).toBeDefined();
    });

    it('should support issue assignment', () => {
      const issue: Partial<Issue> = {
        assignedTo: '123e4567-e89b-12d3-a456-426614174000',
      };

      expect(issue.assignedTo).toBeDefined();
    });
  });

  describe('DailyLog interface', () => {
    it('should validate daily log with all mandatory fields', () => {
      const log: DailyLog = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        authorId: '123e4567-e89b-12d3-a456-426614174002',
        date: new Date('2024-03-15'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(log.projectId).toBeDefined();
      expect(log.authorId).toBeDefined();
      expect(log.date).toBeInstanceOf(Date);
    });

    it('should support weather conditions', () => {
      const weatherConditions: DailyLog['weather'][] = ['Good', 'Fair', 'Poor', 'N/A'];

      weatherConditions.forEach((weather) => {
        const log: Partial<DailyLog> = { weather };
        expect(log.weather).toBe(weather);
      });
    });

    it('should support comprehensive daily log', () => {
      const log: DailyLog = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        authorId: '123e4567-e89b-12d3-a456-426614174002',
        date: new Date('2024-03-15'),
        notes: 'Cabinet installation progressing on schedule. Plumbing work completed.',
        weather: 'Good',
        photos: ['https://cdn.example.com/log/photo1.jpg', 'https://cdn.example.com/log/photo2.jpg'],
        attendees: ['Designer Jane', 'Contractor Mike', 'Electrician Tom'],
        activities: ['Cabinet installation', 'Electrical rough-in', 'Plumbing inspection'],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(log.notes).toBeDefined();
      expect(log.photos).toHaveLength(2);
      expect(log.attendees).toHaveLength(3);
      expect(log.activities).toHaveLength(3);
    });
  });

  describe('ProjectDocument interface', () => {
    it('should validate project document with all mandatory fields', () => {
      const document: ProjectDocument = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        title: 'Kitchen Layout Drawing',
        key: 'projects/project-1/drawings/kitchen-layout-v2.pdf',
        category: 'drawing',
        version: 2,
        uploadedBy: '123e4567-e89b-12d3-a456-426614174002',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(document.title).toBeDefined();
      expect(document.category).toBe('drawing');
      expect(document.version).toBe(2);
    });

    it('should support all document categories', () => {
      const categories: ProjectDocument['category'][] = [
        'contract',
        'drawing',
        'spec',
        'photo',
        'invoice',
        'other',
      ];

      categories.forEach((category) => {
        const document: Partial<ProjectDocument> = { category };
        expect(document.category).toBe(category);
      });
    });

    it('should support file metadata', () => {
      const document: Partial<ProjectDocument> = {
        size: 2048576, // ~2MB
        mimeType: 'application/pdf',
        metadata: { author: 'Jane Designer', confidential: false },
      };

      expect(document.size).toBeGreaterThan(0);
      expect(document.mimeType).toBe('application/pdf');
      expect(document.metadata?.author).toBe('Jane Designer');
    });
  });

  describe('Milestone interface', () => {
    it('should validate milestone with all mandatory fields', () => {
      const milestone: Milestone = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        title: 'Cabinet Installation Complete',
        targetDate: new Date('2024-04-15'),
        status: 'pending',
        order: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(milestone.title).toBeDefined();
      expect(milestone.targetDate).toBeInstanceOf(Date);
      expect(milestone.status).toBe('pending');
    });

    it('should support all milestone statuses', () => {
      const statuses: Milestone['status'][] = ['pending', 'completed', 'delayed', 'cancelled'];

      statuses.forEach((status) => {
        const milestone: Partial<Milestone> = { status };
        expect(milestone.status).toBe(status);
      });
    });

    it('should track milestone completion', () => {
      const milestone: Partial<Milestone> = {
        status: 'completed',
        completedAt: new Date(),
      };

      expect(milestone.status).toBe('completed');
      expect(milestone.completedAt).toBeDefined();
    });

    it('should support milestone ordering', () => {
      const milestones: Partial<Milestone>[] = [
        { title: 'Demolition Complete', order: 1 },
        { title: 'Rough-in Complete', order: 2 },
        { title: 'Cabinet Installation Complete', order: 3 },
        { title: 'Final Inspection', order: 4 },
      ];

      milestones.forEach((milestone, index) => {
        expect(milestone.order).toBe(index + 1);
      });
    });
  });

  describe('CreateProjectDTO', () => {
    it('should validate project creation DTO', () => {
      const dto: CreateProjectDTO = {
        title: 'New Kitchen Remodel',
        clientId: '123e4567-e89b-12d3-a456-426614174001',
        designerId: '123e4567-e89b-12d3-a456-426614174002',
      };

      expect(dto.title).toBeDefined();
      expect(dto.clientId).toBeDefined();
      expect(dto.designerId).toBeDefined();
    });

    it('should support optional fields in DTO', () => {
      const dto: CreateProjectDTO = {
        proposalId: '123e4567-e89b-12d3-a456-426614174003',
        title: 'Living Room Redesign',
        clientId: '123e4567-e89b-12d3-a456-426614174001',
        designerId: '123e4567-e89b-12d3-a456-426614174002',
        startDate: new Date('2024-05-01'),
        endDate: new Date('2024-08-31'),
        budget: 35000,
        currency: 'USD',
        description: 'Complete living room furniture and decor refresh',
      };

      expect(dto.proposalId).toBeDefined();
      expect(dto.budget).toBe(35000);
      expect(dto.description).toBeDefined();
    });
  });

  describe('CreateTaskDTO', () => {
    it('should validate task creation DTO', () => {
      const dto: CreateTaskDTO = {
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        title: 'Order cabinet hardware',
      };

      expect(dto.projectId).toBeDefined();
      expect(dto.title).toBeDefined();
    });

    it('should support optional fields in task DTO', () => {
      const dto: CreateTaskDTO = {
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        title: 'Install backsplash tile',
        description: 'Install subway tile backsplash in kitchen',
        assigneeId: '123e4567-e89b-12d3-a456-426614174002',
        dueDate: new Date('2024-04-20'),
        priority: 'high',
      };

      expect(dto.description).toBeDefined();
      expect(dto.assigneeId).toBeDefined();
      expect(dto.priority).toBe('high');
    });
  });

  describe('ProjectWithDetails', () => {
    it('should validate project with all related entities', () => {
      const project: ProjectWithDetails = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Complete Home Renovation',
        clientId: '123e4567-e89b-12d3-a456-426614174001',
        designerId: '123e4567-e89b-12d3-a456-426614174002',
        status: 'active',
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
        tasks: [],
        rfis: [],
        changeOrders: [],
        issues: [],
        milestones: [],
      };

      expect(project.tasks).toBeInstanceOf(Array);
      expect(project.rfis).toBeInstanceOf(Array);
      expect(project.changeOrders).toBeInstanceOf(Array);
      expect(project.issues).toBeInstanceOf(Array);
      expect(project.milestones).toBeInstanceOf(Array);
    });

    it('should support populated related entities', () => {
      const task: Task = {
        id: '123e4567-e89b-12d3-a456-426614174010',
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Task 1',
        status: 'todo',
        priority: 'medium',
        order: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const rfi: RFI = {
        id: '123e4567-e89b-12d3-a456-426614174011',
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        title: 'RFI 1',
        question: 'Question?',
        requestedBy: '123e4567-e89b-12d3-a456-426614174002',
        status: 'open',
        priority: 'normal',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const project: ProjectWithDetails = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Project',
        clientId: '123e4567-e89b-12d3-a456-426614174001',
        designerId: '123e4567-e89b-12d3-a456-426614174002',
        status: 'active',
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
        tasks: [task],
        rfis: [rfi],
        changeOrders: [],
        issues: [],
        milestones: [],
      };

      expect(project.tasks).toHaveLength(1);
      expect(project.rfis).toHaveLength(1);
    });
  });
});
