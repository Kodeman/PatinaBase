import { PrismaClient } from '../src/generated/prisma-client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting comprehensive Patina projects seed...');

  // Clear existing data (DANGEROUS - only for dev!)
  console.log('🗑️  Clearing existing data...');
  await prisma.queuedMessage.deleteMany();
  await prisma.activeConnection.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.engagementMetrics.deleteMany();
  await prisma.clientActivity.deleteMany();
  await prisma.approvalRecord.deleteMany();
  await prisma.projectUpdate.deleteMany();
  await prisma.timelineSegment.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.document.deleteMany();
  await prisma.dailyLog.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.changeOrder.deleteMany();
  await prisma.rFI.deleteMany();
  await prisma.task.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.outboxEvent.deleteMany();
  await prisma.project.deleteMany();

  // =============================================================================
  // USER IDs - In production, these would be fetched from user-management service
  // For dev, we're using predictable UUIDs that should match seed data
  // =============================================================================
  const DESIGNER_ID = 'd1234567-89ab-cdef-0123-456789abcdef'; // Sarah Mitchell
  const CLIENT_ID = 'c1234567-89ab-cdef-0123-456789abcdef'; // Jennifer Chen
  const ADMIN_ID = 'a1234567-89ab-cdef-0123-456789abcdef'; // Admin user

  console.log('👥 Using user IDs:');
  console.log(`  Designer: ${DESIGNER_ID} (Sarah Mitchell)`);
  console.log(`  Client: ${CLIENT_ID} (Jennifer Chen)`);
  console.log(`  Admin: ${ADMIN_ID} (Admin)`);

  // =============================================================================
  // PROJECT: Luxury Penthouse Transformation
  // =============================================================================
  console.log('\n📦 Creating project: Luxury Penthouse Transformation...');

  const startDate = new Date('2025-09-01');
  const endDate = new Date('2026-03-15');

  const project = await prisma.project.create({
    data: {
      title: 'Luxury Penthouse Transformation',
      clientId: CLIENT_ID,
      designerId: DESIGNER_ID,
      status: 'active',
      startDate,
      endDate,
      budget: 185000,
      currency: 'USD',
      description: `Complete interior transformation of a 2,800 sq ft penthouse in Manhattan's Chelsea neighborhood. The project encompasses custom furniture design, curated art installations, smart home integration, and a sophisticated material palette featuring walnut, marble, and brass accents. The client seeks a modern, gallery-like aesthetic with warm, livable spaces perfect for entertaining and family life.`,
      metadata: {
        location: {
          address: '555 West 25th Street, Penthouse A',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          neighborhood: 'Chelsea'
        },
        propertyDetails: {
          squareFeet: 2800,
          bedrooms: 3,
          bathrooms: 2.5,
          floors: 1,
          views: ['Hudson River', 'City Skyline'],
          buildingYear: 2019,
          ceilingHeight: 11
        },
        projectScope: [
          'Living Room Redesign',
          'Primary Bedroom Suite',
          'Kitchen Renovation',
          'Custom Built-ins',
          'Lighting Design',
          'Art Curation',
          'Smart Home Integration',
          'Window Treatments'
        ],
        styleProfile: {
          primaryStyle: 'Contemporary',
          secondaryStyles: ['Mid-Century Modern', 'Industrial Chic'],
          colorPalette: ['Warm Neutrals', 'Deep Charcoal', 'Brass Accents', 'Forest Green'],
          keywords: ['Sophisticated', 'Gallery-like', 'Warm', 'Timeless']
        },
        clientPreferences: {
          entertainingFrequency: 'Often (2-3x per month)',
          lifestyleNeeds: ['Home Office', 'Wine Storage', 'Pet-Friendly'],
          mustHaves: ['Natural Light', 'Storage Solutions', 'Comfortable Seating'],
          avoidances: ['Ultra-modern cold aesthetics', 'Overly trendy pieces']
        },
        budget: {
          furniture: 85000,
          materials: 45000,
          labor: 35000,
          artAndDecor: 15000,
          contingency: 5000
        }
      },
    },
  });

  console.log(`✅ Project created: ${project.id}`);

  // =============================================================================
  // TIMELINE SEGMENTS (5 phases)
  // =============================================================================
  console.log('\n📅 Creating timeline segments...');

  const segments = await Promise.all([
    // Phase 1: Planning & Design (COMPLETED)
    prisma.timelineSegment.create({
      data: {
        projectId: project.id,
        title: 'Planning & Design Development',
        description: 'Initial consultation, space planning, concept development, and design approval',
        phase: 'planning',
        startDate: new Date('2025-09-01'),
        endDate: new Date('2025-10-15'),
        status: 'completed',
        progress: 100,
        order: 1,
        deliverables: [
          'Initial consultation notes',
          'Space planning layouts (3 options)',
          'Material palette boards',
          'Furniture selection presentations',
          'Budget breakdown',
          'Project timeline',
          'Signed design contract'
        ],
        metadata: {
          keyMilestones: ['Initial Consultation', 'Concept Presentation', 'Design Approval'],
          teamMembers: [DESIGNER_ID, CLIENT_ID],
          completedActivities: 7,
          totalActivities: 7
        }
      }
    }),

    // Phase 2: Material Selection & Procurement (IN PROGRESS - 65%)
    prisma.timelineSegment.create({
      data: {
        projectId: project.id,
        title: 'Material Selection & Procurement',
        description: 'Finalizing materials, furniture ordering, and vendor coordination',
        phase: 'procurement',
        startDate: new Date('2025-10-16'),
        endDate: new Date('2025-12-10'),
        status: 'in_progress',
        progress: 65,
        order: 2,
        deliverables: [
          'Final material selections',
          'Furniture purchase orders',
          'Custom fabrication contracts',
          'Lighting fixture orders',
          'Textile and rug selections',
          'Art acquisition plan',
          'Delivery schedule'
        ],
        dependencies: ['Phase 1'],
        metadata: {
          keyMilestones: ['Material Finalization', 'Furniture Selection Approval', 'Custom Orders Placed'],
          currentFocus: 'Furniture selection approval pending',
          blockers: [],
          teamMembers: [DESIGNER_ID, CLIENT_ID]
        }
      }
    }),

    // Phase 3: Pre-Installation & Site Prep (PENDING)
    prisma.timelineSegment.create({
      data: {
        projectId: project.id,
        title: 'Pre-Installation & Site Preparation',
        description: 'Site measurements, wall treatments, lighting installation, and storage solutions',
        phase: 'construction',
        startDate: new Date('2025-12-11'),
        endDate: new Date('2026-01-20'),
        status: 'pending',
        progress: 0,
        order: 3,
        deliverables: [
          'Wall preparation and painting',
          'Lighting fixture installation',
          'Built-in millwork',
          'Window treatment installation',
          'Floor refinishing (if needed)',
          'Smart home system installation',
          'Final site inspection'
        ],
        dependencies: ['Phase 2'],
        metadata: {
          keyMilestones: ['Site Prep Complete', 'Built-ins Installed', 'Smart Home Functional'],
          estimatedStartDate: '2025-12-11',
          teamMembers: [DESIGNER_ID, ADMIN_ID],
          vendors: ['Premier Millwork Co.', 'SmartHome Solutions NYC', 'Chelsea Painters']
        }
      }
    }),

    // Phase 4: Furniture Installation & Styling (PENDING)
    prisma.timelineSegment.create({
      data: {
        projectId: project.id,
        title: 'Furniture Installation & Styling',
        description: 'Furniture delivery, placement, art installation, and final styling',
        phase: 'construction',
        startDate: new Date('2026-01-21'),
        endDate: new Date('2026-03-01'),
        status: 'pending',
        progress: 0,
        order: 4,
        deliverables: [
          'Furniture delivery coordination',
          'Professional furniture assembly',
          'Art and decor placement',
          'Rug installation',
          'Window treatment hanging',
          'Accessory styling',
          'Photography documentation',
          'Walkthrough with client'
        ],
        dependencies: ['Phase 3'],
        metadata: {
          keyMilestones: ['Furniture Delivered', 'Art Installed', 'Final Styling Complete'],
          estimatedStartDate: '2026-01-21',
          criticalPath: true,
          teamMembers: [DESIGNER_ID, CLIENT_ID]
        }
      }
    }),

    // Phase 5: Final Touches & Completion (PENDING)
    prisma.timelineSegment.create({
      data: {
        projectId: project.id,
        title: 'Final Touches & Project Completion',
        description: 'Final adjustments, client training, documentation, and project closeout',
        phase: 'completion',
        startDate: new Date('2026-03-02'),
        endDate: new Date('2026-03-15'),
        status: 'pending',
        progress: 0,
        order: 5,
        deliverables: [
          'Final walkthrough and punch list',
          'Client orientation and training',
          'Maintenance documentation',
          'Warranty information',
          'Product care guides',
          'Professional photography',
          'Project case study',
          'Final invoicing and closeout'
        ],
        dependencies: ['Phase 4'],
        metadata: {
          keyMilestones: ['Final Walkthrough', 'Client Handoff', 'Project Photography'],
          estimatedStartDate: '2026-03-02',
          completionCelebration: true,
          teamMembers: [DESIGNER_ID, CLIENT_ID]
        }
      }
    })
  ]);

  console.log(`✅ Created ${segments.length} timeline segments`);

  // =============================================================================
  // MILESTONES (10 total: 2 completed, 1 active, 7 upcoming)
  // =============================================================================
  console.log('\n🎯 Creating milestones...');

  const milestones = await Promise.all([
    // COMPLETED MILESTONES (2)
    prisma.milestone.create({
      data: {
        projectId: project.id,
        title: 'Initial Design Concept Approved',
        description: 'Client approved the overall design direction, material palette, and furniture selections after reviewing three concept options.',
        targetDate: new Date('2025-09-20'),
        completedAt: new Date('2025-09-21'),
        status: 'completed',
        order: 1,
        media: [
          {
            id: 'media-001',
            url: 'https://cdn.patina.dev/projects/penthouse/concept-board-1.jpg',
            type: 'image',
            caption: 'Approved Living Room Concept - Contemporary elegance with warm tones',
            thumbnailUrl: 'https://cdn.patina.dev/projects/penthouse/concept-board-1-thumb.jpg'
          },
          {
            id: 'media-002',
            url: 'https://cdn.patina.dev/projects/penthouse/concept-board-2.jpg',
            type: 'image',
            caption: 'Primary Bedroom Suite - Serene retreat with custom millwork',
            thumbnailUrl: 'https://cdn.patina.dev/projects/penthouse/concept-board-2-thumb.jpg'
          },
          {
            id: 'media-003',
            url: 'https://cdn.patina.dev/projects/penthouse/palette.jpg',
            type: 'image',
            caption: 'Material Palette - Walnut, marble, brass, and textured fabrics',
            thumbnailUrl: 'https://cdn.patina.dev/projects/penthouse/palette-thumb.jpg'
          }
        ],
        metadata: {
          celebrationWorthy: true,
          clientFeedback: 'We absolutely love the direction! The material palette feels luxurious yet livable.',
          designerNotes: 'Client responded enthusiastically to Option 2 with mid-century modern influences and warm neutral tones.',
          approvalDate: '2025-09-21',
          revisionsRequested: 1
        }
      }
    }),

    prisma.milestone.create({
      data: {
        projectId: project.id,
        title: 'Space Planning Finalized',
        description: 'Final floor plan approved with furniture layouts, traffic flow optimization, and electrical/lighting plans.',
        targetDate: new Date('2025-10-10'),
        completedAt: new Date('2025-10-12'),
        status: 'completed',
        order: 2,
        media: [
          {
            id: 'media-004',
            url: 'https://cdn.patina.dev/projects/penthouse/floor-plan-final.pdf',
            type: 'document',
            caption: 'Final Floor Plan with Furniture Layout',
            thumbnailUrl: 'https://cdn.patina.dev/projects/penthouse/floor-plan-final-thumb.jpg'
          },
          {
            id: 'media-005',
            url: 'https://cdn.patina.dev/projects/penthouse/lighting-plan.pdf',
            type: 'document',
            caption: 'Lighting Design Plan',
            thumbnailUrl: 'https://cdn.patina.dev/projects/penthouse/lighting-plan-thumb.jpg'
          },
          {
            id: 'media-006',
            url: 'https://cdn.patina.dev/projects/penthouse/3d-rendering-living.jpg',
            type: 'image',
            caption: '3D Rendering - Living Room Looking Toward Kitchen',
            thumbnailUrl: 'https://cdn.patina.dev/projects/penthouse/3d-rendering-living-thumb.jpg',
            metadata: {
              renderEngine: 'V-Ray',
              viewingAngle: 'Southwest',
              timeOfDay: 'Golden Hour'
            }
          }
        ],
        metadata: {
          celebrationWorthy: true,
          clientFeedback: 'The 3D renderings really helped us visualize the space. The flow is perfect!',
          designerNotes: 'Minor adjustment to kitchen island seating to accommodate client\'s bar stool preference.',
          technicalReviewComplete: true,
          electricalSignOff: true
        }
      }
    }),

    // ACTIVE MILESTONE (1)
    prisma.milestone.create({
      data: {
        projectId: project.id,
        title: 'Furniture Selection Approval',
        description: 'Final review and approval of all furniture pieces including custom sofa, dining table, bedroom furniture, and accent pieces.',
        targetDate: new Date('2025-11-15'),
        completedAt: null,
        status: 'in_progress',
        order: 3,
        media: [
          {
            id: 'media-007',
            url: 'https://cdn.patina.dev/projects/penthouse/furniture-sofa-presentation.jpg',
            type: 'image',
            caption: 'Custom Sectional Sofa - Awaiting Approval',
            thumbnailUrl: 'https://cdn.patina.dev/projects/penthouse/furniture-sofa-presentation-thumb.jpg'
          },
          {
            id: 'media-008',
            url: 'https://cdn.patina.dev/projects/penthouse/dining-table-options.jpg',
            type: 'image',
            caption: 'Dining Table Options - Two finalists',
            thumbnailUrl: 'https://cdn.patina.dev/projects/penthouse/dining-table-options-thumb.jpg'
          },
          {
            id: 'media-009',
            url: 'https://cdn.patina.dev/projects/penthouse/bedroom-furniture-set.jpg',
            type: 'image',
            caption: 'Primary Bedroom Furniture Suite',
            thumbnailUrl: 'https://cdn.patina.dev/projects/penthouse/bedroom-furniture-set-thumb.jpg'
          }
        ],
        metadata: {
          awaitingClientApproval: true,
          urgency: 'High - lead times are 12-14 weeks',
          itemsPendingApproval: 8,
          totalItems: 23,
          approvedItems: 15,
          designerNotes: 'Sent approval request on 2025-10-28. Follow-up scheduled for 2025-11-05.',
          estimatedLeadTimes: {
            customSofa: '14 weeks',
            diningTable: '10 weeks',
            bedroomFurniture: '12 weeks'
          }
        }
      }
    }),

    // UPCOMING MILESTONES (7)
    prisma.milestone.create({
      data: {
        projectId: project.id,
        title: 'All Custom Orders Placed',
        description: 'Purchase orders submitted for all custom furniture, millwork, and fabrication items.',
        targetDate: new Date('2025-11-25'),
        completedAt: null,
        status: 'pending',
        order: 4,
        media: [],
        metadata: {
          dependencies: ['Furniture Selection Approval'],
          estimatedOrderValue: 85000,
          vendorCount: 7
        }
      }
    }),

    prisma.milestone.create({
      data: {
        projectId: project.id,
        title: 'Material Samples Approved',
        description: 'Final approval of all material samples including textiles, rugs, wallcoverings, and finishes.',
        targetDate: new Date('2025-12-01'),
        completedAt: null,
        status: 'pending',
        order: 5,
        media: [],
        metadata: {
          samplesRequested: 34,
          samplesApproved: 28,
          samplesInTransit: 6
        }
      }
    }),

    prisma.milestone.create({
      data: {
        projectId: project.id,
        title: 'Site Preparation Complete',
        description: 'All wall treatments, painting, and site prep work completed and inspected.',
        targetDate: new Date('2026-01-10'),
        completedAt: null,
        status: 'pending',
        order: 6,
        media: [],
        metadata: {
          workTypes: ['Painting', 'Millwork Installation', 'Lighting', 'Window Treatments'],
          estimatedDuration: '3 weeks'
        }
      }
    }),

    prisma.milestone.create({
      data: {
        projectId: project.id,
        title: 'Custom Millwork Installed',
        description: 'All custom built-ins, shelving, and millwork pieces installed and finished.',
        targetDate: new Date('2026-01-20'),
        completedAt: null,
        status: 'pending',
        order: 7,
        media: [],
        metadata: {
          millworkPieces: ['Living Room Built-ins', 'Primary Closet System', 'Kitchen Wine Storage', 'Office Shelving'],
          vendor: 'Premier Millwork Co.'
        }
      }
    }),

    prisma.milestone.create({
      data: {
        projectId: project.id,
        title: 'Furniture Delivered & Installed',
        description: 'All furniture pieces delivered, assembled, and placed according to floor plan.',
        targetDate: new Date('2026-02-15'),
        completedAt: null,
        status: 'pending',
        order: 8,
        media: [],
        metadata: {
          deliveryWindows: ['2026-02-10 to 2026-02-12', '2026-02-13 to 2026-02-15'],
          assemblyRequired: true,
          furnitureItems: 23
        }
      }
    }),

    prisma.milestone.create({
      data: {
        projectId: project.id,
        title: 'Art & Decor Installation',
        description: 'All artwork, decor items, and accessories installed and styled.',
        targetDate: new Date('2026-02-28'),
        completedAt: null,
        status: 'pending',
        order: 9,
        media: [],
        metadata: {
          artworks: 12,
          decorItems: 47,
          professionalHangingRequired: true
        }
      }
    }),

    prisma.milestone.create({
      data: {
        projectId: project.id,
        title: 'Final Walkthrough & Project Completion',
        description: 'Final inspection, punch list completion, client orientation, and project handoff.',
        targetDate: new Date('2026-03-15'),
        completedAt: null,
        status: 'pending',
        order: 10,
        media: [],
        metadata: {
          photographyScheduled: true,
          photographerName: 'Emily Santos Photography',
          photographyDate: '2026-03-18',
          completionCelebration: true,
          clientOrientation: true
        }
      }
    })
  ]);

  console.log(`✅ Created ${milestones.length} milestones (2 completed, 1 active, 7 upcoming)`);

  // =============================================================================
  // TASKS (28 across milestones and timeline)
  // =============================================================================
  console.log('\n✅ Creating tasks...');

  const tasks = await Promise.all([
    // Phase 1 - Planning (COMPLETED - 6 tasks)
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Conduct initial client consultation',
        description: 'In-depth discussion of client lifestyle, preferences, budget, and timeline',
        assigneeId: DESIGNER_ID,
        status: 'done',
        priority: 'high',
        order: 1,
        completedAt: new Date('2025-09-02'),
        dueDate: new Date('2025-09-02')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Perform site measurements and documentation',
        description: 'Detailed measurements, photos, and architectural documentation of the space',
        assigneeId: DESIGNER_ID,
        status: 'done',
        priority: 'high',
        order: 2,
        completedAt: new Date('2025-09-05'),
        dueDate: new Date('2025-09-05')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Develop three concept directions',
        description: 'Create mood boards and concept presentations for client review',
        assigneeId: DESIGNER_ID,
        status: 'done',
        priority: 'high',
        order: 3,
        completedAt: new Date('2025-09-15'),
        dueDate: new Date('2025-09-15')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Present concepts to client',
        description: 'Formal presentation of three design concepts with material samples',
        assigneeId: DESIGNER_ID,
        status: 'done',
        priority: 'high',
        order: 4,
        completedAt: new Date('2025-09-18'),
        dueDate: new Date('2025-09-18')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Finalize space planning and layouts',
        description: 'Develop detailed floor plans with furniture placement',
        assigneeId: DESIGNER_ID,
        status: 'done',
        priority: 'high',
        order: 5,
        completedAt: new Date('2025-10-08'),
        dueDate: new Date('2025-10-08')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Create 3D renderings',
        description: 'Photorealistic renderings of key spaces',
        assigneeId: DESIGNER_ID,
        status: 'done',
        priority: 'medium',
        order: 6,
        completedAt: new Date('2025-10-10'),
        dueDate: new Date('2025-10-10')
      }
    }),

    // Phase 2 - Material Selection & Procurement (3 done, 4 in progress, 1 todo - 8 tasks)
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Order material samples for client review',
        description: 'Textiles, wallcoverings, flooring, and finish samples',
        assigneeId: DESIGNER_ID,
        status: 'done',
        priority: 'high',
        order: 7,
        completedAt: new Date('2025-10-20'),
        dueDate: new Date('2025-10-18')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Curate furniture options for living room',
        description: 'Sofa, lounge chairs, coffee table, side tables, media console',
        assigneeId: DESIGNER_ID,
        status: 'done',
        priority: 'high',
        order: 8,
        completedAt: new Date('2025-10-25'),
        dueDate: new Date('2025-10-25')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Present furniture selections to client',
        description: 'Comprehensive furniture presentation with pricing and lead times',
        assigneeId: DESIGNER_ID,
        status: 'done',
        priority: 'high',
        order: 9,
        completedAt: new Date('2025-10-28'),
        dueDate: new Date('2025-10-28')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'URGENT: Follow up on furniture approval',
        description: 'Client review needed - 12-14 week lead times require immediate decision',
        assigneeId: DESIGNER_ID,
        status: 'in_progress',
        priority: 'urgent',
        order: 10,
        dueDate: new Date('2025-11-05'),
        metadata: {
          reminderSent: true,
          lastContact: '2025-10-30',
          blockingItems: ['Custom sectional sofa', 'Dining table', 'Bedroom furniture suite']
        }
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Source lighting fixtures',
        description: 'Pendant lights, chandeliers, sconces, and table lamps',
        assigneeId: DESIGNER_ID,
        status: 'in_progress',
        priority: 'high',
        order: 11,
        dueDate: new Date('2025-11-10')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Coordinate custom millwork specifications',
        description: 'Detailed drawings and specifications for built-in cabinetry',
        assigneeId: DESIGNER_ID,
        status: 'in_progress',
        priority: 'high',
        order: 12,
        dueDate: new Date('2025-11-12')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Select window treatment fabrics and hardware',
        description: 'Drapery, shades, and hardware for all windows',
        assigneeId: DESIGNER_ID,
        status: 'in_progress',
        priority: 'medium',
        order: 13,
        dueDate: new Date('2025-11-15')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Curate art and accessories',
        description: 'Artwork, sculptures, vases, and decorative objects',
        assigneeId: DESIGNER_ID,
        status: 'todo',
        priority: 'medium',
        order: 14,
        dueDate: new Date('2025-11-20')
      }
    }),

    // Phase 3 - Site Prep (PENDING - 4 tasks)
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Coordinate painting schedule',
        description: 'Schedule wall preparation and painting with contractor',
        assigneeId: DESIGNER_ID,
        status: 'todo',
        priority: 'medium',
        order: 15,
        dueDate: new Date('2025-12-01')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Schedule millwork installation',
        description: 'Coordinate built-in installation with Premier Millwork Co.',
        assigneeId: ADMIN_ID,
        status: 'todo',
        priority: 'medium',
        order: 16,
        dueDate: new Date('2025-12-15')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Coordinate smart home installation',
        description: 'Schedule lighting control and AV system installation',
        assigneeId: ADMIN_ID,
        status: 'todo',
        priority: 'medium',
        order: 17,
        dueDate: new Date('2026-01-05')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Inspect completed site work',
        description: 'Quality check all prep work before furniture delivery',
        assigneeId: DESIGNER_ID,
        status: 'todo',
        priority: 'high',
        order: 18,
        dueDate: new Date('2026-01-20')
      }
    }),

    // Phase 4 - Installation (PENDING - 5 tasks)
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Schedule furniture deliveries',
        description: 'Coordinate delivery windows for all furniture items',
        assigneeId: ADMIN_ID,
        status: 'todo',
        priority: 'high',
        order: 19,
        dueDate: new Date('2026-01-25')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Oversee furniture installation',
        description: 'On-site supervision of furniture placement and assembly',
        assigneeId: DESIGNER_ID,
        status: 'todo',
        priority: 'high',
        order: 20,
        dueDate: new Date('2026-02-15')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Install window treatments',
        description: 'Drapery and shade installation in all rooms',
        assigneeId: ADMIN_ID,
        status: 'todo',
        priority: 'medium',
        order: 21,
        dueDate: new Date('2026-02-18')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Hang artwork and mirrors',
        description: 'Professional art installation with proper hanging systems',
        assigneeId: DESIGNER_ID,
        status: 'todo',
        priority: 'medium',
        order: 22,
        dueDate: new Date('2026-02-25')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Place decorative accessories',
        description: 'Style all surfaces with accessories, books, and decorative items',
        assigneeId: DESIGNER_ID,
        status: 'todo',
        priority: 'medium',
        order: 23,
        dueDate: new Date('2026-02-28')
      }
    }),

    // Phase 5 - Completion (PENDING - 5 tasks)
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Create punch list with client',
        description: 'Walk-through to identify any final adjustments needed',
        assigneeId: DESIGNER_ID,
        status: 'todo',
        priority: 'high',
        order: 24,
        dueDate: new Date('2026-03-02')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Complete punch list items',
        description: 'Address all final adjustment items identified',
        assigneeId: ADMIN_ID,
        status: 'todo',
        priority: 'high',
        order: 25,
        dueDate: new Date('2026-03-08')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Schedule professional photography',
        description: 'Book photographer and coordinate styling for shoot',
        assigneeId: DESIGNER_ID,
        status: 'todo',
        priority: 'medium',
        order: 26,
        dueDate: new Date('2026-03-10')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Prepare maintenance documentation',
        description: 'Compile care guides, warranties, and product information',
        assigneeId: DESIGNER_ID,
        status: 'todo',
        priority: 'medium',
        order: 27,
        dueDate: new Date('2026-03-12')
      }
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Conduct final client orientation',
        description: 'Review all systems, care instructions, and warranty information',
        assigneeId: DESIGNER_ID,
        status: 'todo',
        priority: 'high',
        order: 28,
        dueDate: new Date('2026-03-15')
      }
    })
  ]);

  console.log(`✅ Created ${tasks.length} tasks (9 completed, 4 in progress, 15 pending)`);

  // Continue with part 2 in this same file...
  console.log('\n📄 Creating documents...');

  const documents = await prisma.document.createMany({
    data: [
      // Contracts (2)
      {
        projectId: project.id,
        title: 'Design Services Agreement - Signed',
        key: 'contracts/design-services-agreement-signed.pdf',
        category: 'contract',
        version: 1,
        size: 245680,
        mimeType: 'application/pdf',
        uploadedBy: DESIGNER_ID,
        metadata: {
          signedDate: '2025-09-02',
          signatories: ['Jennifer Chen', 'Sarah Mitchell'],
          contractValue: 185000
        }
      },
      {
        projectId: project.id,
        title: 'Custom Millwork Contract',
        key: 'contracts/millwork-contract.pdf',
        category: 'contract',
        version: 1,
        size: 189200,
        mimeType: 'application/pdf',
        uploadedBy: DESIGNER_ID,
        metadata: {
          vendor: 'Premier Millwork Co.',
          contractValue: 28500
        }
      },
      // Drawings (3)
      {
        projectId: project.id,
        title: 'Floor Plan - Final Approved',
        key: 'drawings/floor-plan-final.pdf',
        category: 'drawing',
        version: 3,
        size: 1420000,
        mimeType: 'application/pdf',
        uploadedBy: DESIGNER_ID,
        metadata: {
          approvedDate: '2025-10-12',
          scale: '1/4" = 1\'0"'
        }
      },
      {
        projectId: project.id,
        title: 'Reflected Ceiling Plan',
        key: 'drawings/rcp-lighting.pdf',
        category: 'drawing',
        version: 2,
        size: 987000,
        mimeType: 'application/pdf',
        uploadedBy: DESIGNER_ID
      },
      {
        projectId: project.id,
        title: 'Millwork Shop Drawings',
        key: 'drawings/millwork-shop.pdf',
        category: 'drawing',
        version: 1,
        size: 2100000,
        mimeType: 'application/pdf',
        uploadedBy: DESIGNER_ID
      },
      // Specifications (3)
      {
        projectId: project.id,
        title: 'Material Specifications',
        key: 'specs/materials.pdf',
        category: 'spec',
        version: 2,
        size: 456000,
        mimeType: 'application/pdf',
        uploadedBy: DESIGNER_ID
      },
      {
        projectId: project.id,
        title: 'Furniture Specifications',
        key: 'specs/furniture.pdf',
        category: 'spec',
        version: 1,
        size: 892000,
        mimeType: 'application/pdf',
        uploadedBy: DESIGNER_ID
      },
      {
        projectId: project.id,
        title: 'Lighting Fixture Schedule',
        key: 'specs/lighting-schedule.xlsx',
        category: 'spec',
        version: 1,
        size: 78000,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        uploadedBy: DESIGNER_ID
      },
      // Photos (3)
      {
        projectId: project.id,
        title: 'Existing Space - Living Room',
        key: 'photos/existing-living-room.jpg',
        category: 'photo',
        version: 1,
        size: 3450000,
        mimeType: 'image/jpeg',
        uploadedBy: DESIGNER_ID
      },
      {
        projectId: project.id,
        title: 'Existing Space - Bedroom',
        key: 'photos/existing-bedroom.jpg',
        category: 'photo',
        version: 1,
        size: 3120000,
        mimeType: 'image/jpeg',
        uploadedBy: DESIGNER_ID
      },
      {
        projectId: project.id,
        title: '3D Rendering - Living Room',
        key: 'renderings/living-room.jpg',
        category: 'photo',
        version: 2,
        size: 4680000,
        mimeType: 'image/jpeg',
        uploadedBy: DESIGNER_ID
      },
      // Invoices (2)
      {
        projectId: project.id,
        title: 'Invoice #001 - Design Deposit',
        key: 'invoices/inv-001.pdf',
        category: 'invoice',
        version: 1,
        size: 125000,
        mimeType: 'application/pdf',
        uploadedBy: DESIGNER_ID,
        metadata: {
          amount: 55500,
          status: 'Paid'
        }
      },
      {
        projectId: project.id,
        title: 'Invoice #002 - Furniture Deposit',
        key: 'invoices/inv-002.pdf',
        category: 'invoice',
        version: 1,
        size: 118000,
        mimeType: 'application/pdf',
        uploadedBy: DESIGNER_ID,
        metadata: {
          amount: 42500,
          status: 'Pending'
        }
      },
      // Other (6)
      {
        projectId: project.id,
        title: 'Project Budget Breakdown',
        key: 'budget/breakdown.xlsx',
        category: 'other',
        version: 2,
        size: 156000,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        uploadedBy: DESIGNER_ID
      },
      {
        projectId: project.id,
        title: 'Project Timeline',
        key: 'timeline/gantt.pdf',
        category: 'other',
        version: 1,
        size: 234000,
        mimeType: 'application/pdf',
        uploadedBy: DESIGNER_ID
      },
      {
        projectId: project.id,
        title: 'Client Style Profile',
        key: 'client/style-profile.pdf',
        category: 'other',
        version: 1,
        size: 890000,
        mimeType: 'application/pdf',
        uploadedBy: DESIGNER_ID
      },
      {
        projectId: project.id,
        title: 'Concept Presentation',
        key: 'presentations/concept-v1.pdf',
        category: 'other',
        version: 1,
        size: 15600000,
        mimeType: 'application/pdf',
        uploadedBy: DESIGNER_ID
      },
      {
        projectId: project.id,
        title: 'Furniture Presentation',
        key: 'presentations/furniture.pdf',
        category: 'other',
        version: 1,
        size: 18200000,
        mimeType: 'application/pdf',
        uploadedBy: DESIGNER_ID
      },
      {
        projectId: project.id,
        title: 'Meeting Notes - Furniture Review',
        key: 'notes/meeting-2025-10-28.pdf',
        category: 'other',
        version: 1,
        size: 67000,
        mimeType: 'application/pdf',
        uploadedBy: DESIGNER_ID
      }
    ]
  });

  console.log(`✅ Created 19 documents`);

  // Continue with remaining entities...

  console.log('\n✨ Seed script complete!');
  console.log('\n📊 Summary:');
  console.log(`  Project: ${project.title}`);
  console.log(`  ID: ${project.id}`);
  console.log(`  Timeline Segments: ${segments.length}`);
  console.log(`  Milestones: ${milestones.length}`);
  console.log(`  Tasks: ${tasks.length}`);
  console.log(`  Documents: 19`);
  console.log('\n🎉 Database seeded successfully!');
  console.log(`\n👉 Test the client portal at: http://localhost:3002/projects/${project.id}`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
