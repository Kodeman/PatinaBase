import 'reflect-metadata';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from '@patina/auth';
import { AnalyticsController } from '../../analytics/analytics.controller';
import {
  ApprovalsController,
  GlobalApprovalsController,
} from '../../approvals/approvals.controller';
import { AuditController } from '../../audit/audit.controller';
import { ChangeOrdersController } from '../../change-orders/change-orders.controller';
import { DailyLogsController } from '../../daily-logs/daily-logs.controller';
import { DocumentsController } from '../../documents/documents.controller';
import { HealthController } from '../../health/health.controller';
import { IssuesController } from '../../issues/issues.controller';
import { MilestonesController } from '../../milestones/milestones.controller';
import { NotificationsController } from '../../notifications/notifications.controller';
import { ProjectUpdatesController } from '../../project-updates/project-updates.controller';
import { ProjectsController } from '../../projects/projects.controller';
import { RfisController } from '../../rfis/rfis.controller';
import { TasksController } from '../../tasks/tasks.controller';
import { TimelineController } from '../../timeline/timeline.controller';
import { MetricsController } from '../metrics.controller';

const CONTROLLERS = [
  AnalyticsController,
  ApprovalsController,
  GlobalApprovalsController,
  AuditController,
  ChangeOrdersController,
  DailyLogsController,
  DocumentsController,
  HealthController,
  IssuesController,
  MilestonesController,
  NotificationsController,
  ProjectUpdatesController,
  ProjectsController,
  RfisController,
  TasksController,
  TimelineController,
  MetricsController,
];

describe('projects controller authorization contract', () => {
  it('protects all 103 non-health routes and retains only three health exceptions', () => {
    const publicRoutes: string[] = [];
    const protectedRoutes: string[] = [];

    for (const controller of CONTROLLERS) {
      for (const methodName of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = (controller.prototype as unknown as Record<string, unknown>)[methodName];
        if (
          typeof handler !== 'function' ||
          Reflect.getMetadata(METHOD_METADATA, handler) === undefined
        ) {
          continue;
        }

        const routeName = `${controller.name}.${methodName}`;
        const isPublic =
          Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true ||
          Reflect.getMetadata(IS_PUBLIC_KEY, controller) === true;
        if (isPublic) {
          publicRoutes.push(routeName);
          continue;
        }

        const permissions =
          Reflect.getMetadata(PERMISSIONS_KEY, handler) ??
          Reflect.getMetadata(PERMISSIONS_KEY, controller);
        expect(permissions).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/^project\.(read\.(assigned|org)|manage\.(own|org)|admin\.all)$/),
          ]),
        );
        protectedRoutes.push(routeName);
      }
    }

    expect(publicRoutes.sort()).toEqual([
      'HealthController.healthCheck',
      'HealthController.liveness',
      'HealthController.readiness',
    ]);
    expect(protectedRoutes).toHaveLength(105);
    expect(publicRoutes).toHaveLength(3);
  });
});
