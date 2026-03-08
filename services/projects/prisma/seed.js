"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_client_1 = require("../src/generated/prisma-client");
const prisma = new prisma_client_1.PrismaClient();
async function main() {
    console.log('🌱 Seeding Projects database...');
    // Create test client project
    const project = await prisma.project.upsert({
        where: { id: 'test-project-1' },
        update: {},
        create: {
            id: 'test-project-1',
            title: 'Modern Mountain Retreat',
            clientId: 'client-123',
            designerId: 'designer-456',
            status: 'active',
            startDate: new Date('2025-08-01'),
            endDate: new Date('2026-02-01'),
            budget: 125000,
            currency: 'USD',
            description: 'A complete renovation of a 3,500 sq ft mountain home featuring custom furniture, modern lighting, and sustainable materials.',
            metadata: {
                location: 'Aspen, Colorado',
                squareFootage: 3500,
                style: 'Modern Mountain',
                rooms: ['Living Room', 'Dining Room', 'Master Bedroom', 'Guest Bedrooms', 'Kitchen'],
            },
        },
    });
    console.log('✅ Created project:', project.title);
    // Create milestones
    const milestones = await Promise.all([
        prisma.milestone.upsert({
            where: { id: 'milestone-1' },
            update: {},
            create: {
                id: 'milestone-1',
                projectId: project.id,
                title: 'Initial Design Concepts',
                description: 'Present initial mood boards and design direction',
                status: 'completed',
                targetDate: new Date('2025-08-15'),
                completedAt: new Date('2025-08-14'),
                order: 1,
                metadata: {
                    deliverables: ['Mood boards', '3D renderings', 'Material samples'],
                },
            },
        }),
        prisma.milestone.upsert({
            where: { id: 'milestone-2' },
            update: {},
            create: {
                id: 'milestone-2',
                projectId: project.id,
                title: 'Custom Furniture Selection',
                description: 'Finalize custom furniture designs and vendors',
                status: 'pending',
                targetDate: new Date('2025-09-30'),
                order: 2,
                metadata: {
                    deliverables: ['Furniture drawings', 'Vendor quotes', 'Material selections'],
                },
            },
        }),
        prisma.milestone.upsert({
            where: { id: 'milestone-3' },
            update: {},
            create: {
                id: 'milestone-3',
                projectId: project.id,
                title: 'Lighting Design & Installation',
                description: 'Custom lighting design and installation coordination',
                status: 'pending',
                targetDate: new Date('2025-11-15'),
                order: 3,
                metadata: {
                    deliverables: ['Lighting plan', 'Fixture specifications', 'Installation schedule'],
                },
            },
        }),
        prisma.milestone.upsert({
            where: { id: 'milestone-4' },
            update: {},
            create: {
                id: 'milestone-4',
                projectId: project.id,
                title: 'Final Installation',
                description: 'Complete installation and styling',
                status: 'pending',
                targetDate: new Date('2026-01-15'),
                order: 4,
                metadata: {
                    deliverables: ['Final installation', 'Professional photography', 'Walkthrough'],
                },
            },
        }),
    ]);
    console.log('✅ Created', milestones.length, 'milestones');
    // Create timeline segments
    const timeline = await Promise.all([
        prisma.timelineSegment.upsert({
            where: { id: 'timeline-1' },
            update: {},
            create: {
                id: 'timeline-1',
                projectId: project.id,
                title: 'Design Phase',
                description: 'Concept development and client approvals',
                phase: 'design',
                startDate: new Date('2025-08-01'),
                endDate: new Date('2025-09-01'),
                status: 'completed',
                progress: 100,
                order: 1,
            },
        }),
        prisma.timelineSegment.upsert({
            where: { id: 'timeline-2' },
            update: {},
            create: {
                id: 'timeline-2',
                projectId: project.id,
                title: 'Procurement',
                description: 'Ordering custom furniture and materials',
                phase: 'procurement',
                startDate: new Date('2025-09-01'),
                endDate: new Date('2025-12-01'),
                status: 'in_progress',
                progress: 45,
                order: 2,
            },
        }),
        prisma.timelineSegment.upsert({
            where: { id: 'timeline-3' },
            update: {},
            create: {
                id: 'timeline-3',
                projectId: project.id,
                title: 'Installation',
                description: 'Delivery and installation of all elements',
                phase: 'construction',
                startDate: new Date('2025-12-15'),
                endDate: new Date('2026-01-31'),
                status: 'pending',
                progress: 0,
                order: 3,
            },
        }),
    ]);
    console.log('✅ Created', timeline.length, 'timeline segments');
    // Create approval records
    const approvals = await Promise.all([
        prisma.approvalRecord.upsert({
            where: { id: 'approval-1' },
            update: {},
            create: {
                id: 'approval-1',
                projectId: project.id,
                segmentId: 'timeline-1',
                title: 'Design Concept Approval',
                description: 'Please review and approve the initial design concepts',
                approvalType: 'design',
                status: 'approved',
                priority: 'high',
                requestedBy: 'designer-456',
                assignedTo: 'client-123',
                dueDate: new Date('2025-08-14'),
                approvedAt: new Date('2025-08-14'),
                approvedBy: 'client-123',
                metadata: {
                    items: ['Living room concept', 'Kitchen concept', 'Master bedroom concept'],
                    feedback: 'Love the modern mountain aesthetic! The material palette is perfect.',
                },
            },
        }),
        prisma.approvalRecord.upsert({
            where: { id: 'approval-2' },
            update: {},
            create: {
                id: 'approval-2',
                projectId: project.id,
                segmentId: 'timeline-2',
                title: 'Furniture Selection Approval',
                description: 'Review and approve custom furniture selections',
                approvalType: 'material',
                status: 'pending',
                priority: 'normal',
                requestedBy: 'designer-456',
                assignedTo: 'client-123',
                dueDate: new Date('2025-09-25'),
                metadata: {
                    items: [
                        'Custom walnut dining table',
                        'Leather sectional sofa',
                        'Accent chairs for living room',
                    ],
                },
            },
        }),
    ]);
    console.log('✅ Created', approvals.length, 'approval records');
    // Create client activities
    const activities = await Promise.all([
        prisma.clientActivity.create({
            data: {
                projectId: project.id,
                segmentId: 'timeline-1',
                userId: 'client-123',
                activityType: 'view',
                entityType: 'segment',
                entityId: 'timeline-1',
                duration: 120,
                metadata: {
                    page: '/project/test-project-1/timeline',
                },
            },
        }),
        prisma.clientActivity.create({
            data: {
                projectId: project.id,
                userId: 'client-123',
                activityType: 'approve',
                entityType: 'approval',
                entityId: 'approval-1',
                metadata: {
                    decision: 'approved',
                    feedback: 'Love the modern mountain aesthetic!',
                },
            },
        }),
        prisma.clientActivity.create({
            data: {
                projectId: project.id,
                segmentId: 'timeline-2',
                userId: 'client-123',
                activityType: 'view',
                entityType: 'milestone',
                entityId: 'milestone-2',
                duration: 45,
                metadata: {
                    page: '/project/test-project-1/milestone/milestone-2',
                },
            },
        }),
    ]);
    console.log('✅ Created', activities.length, 'client activities');
    console.log('');
    console.log('🎉 Seeding complete!');
    console.log('');
    console.log('Test Project Details:');
    console.log('  ID:', project.id);
    console.log('  Title:', project.title);
    console.log('  Client ID:', project.clientId);
    console.log('  Designer ID:', project.designerId);
    console.log('  Status:', project.status);
    console.log('');
    console.log('You can now test the client portal at http://localhost:3002');
    console.log('');
}
main()
    .then(async () => {
    await prisma.$disconnect();
})
    .catch(async (e) => {
    console.error('Error seeding database:', e);
    await prisma.$disconnect();
    process.exit(1);
});
//# sourceMappingURL=seed.js.map