import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CacheService } from '@patina/cache';

interface ProjectEventPayload {
  projectId?: string;
}

@Injectable()
export class ProjectCacheInvalidationListener {
  private readonly logger = new Logger(ProjectCacheInvalidationListener.name);

  constructor(private readonly cacheService: CacheService) {}

  private async invalidateProjectCache(projectId?: string) {
    if (!projectId) {
      return;
    }

    await this.cacheService.invalidateProject(projectId);
    this.logger.debug(`Invalidated cache for project ${projectId}`);
  }

  @OnEvent('project.created')
  @OnEvent('project.status_changed')
  async onProjectMutations(payload: ProjectEventPayload) {
    await this.invalidateProjectCache(payload.projectId);
  }

  @OnEvent('task.created')
  @OnEvent('task.status_changed')
  @OnEvent('task.completed')
  @OnEvent('task.deleted')
  @OnEvent('task.bulk_updated')
  async onTaskEvents(payload: ProjectEventPayload) {
    await this.invalidateProjectCache(payload.projectId);
  }

  @OnEvent('change_order.created')
  @OnEvent('change_order.submitted')
  @OnEvent('change_order.approved')
  @OnEvent('change_order.rejected')
  @OnEvent('change_order.implemented')
  async onChangeOrderEvents(payload: ProjectEventPayload) {
    await this.invalidateProjectCache(payload.projectId);
  }

  @OnEvent('rfi.created')
  @OnEvent('rfi.status_changed')
  @OnEvent('rfi.answered')
  async onRfiEvents(payload: ProjectEventPayload) {
    await this.invalidateProjectCache(payload.projectId);
  }

  @OnEvent('issue.created')
  @OnEvent('issue.status_changed')
  @OnEvent('issue.resolved')
  async onIssueEvents(payload: ProjectEventPayload) {
    await this.invalidateProjectCache(payload.projectId);
  }

  @OnEvent('milestone.created')
  @OnEvent('milestone.status_changed')
  @OnEvent('milestone.completed')
  async onMilestoneEvents(payload: ProjectEventPayload) {
    await this.invalidateProjectCache(payload.projectId);
  }

  @OnEvent('timeline.segment.created')
  @OnEvent('timeline.segment.updated')
  @OnEvent('activity.logged')
  async onTimelineEvents(payload: ProjectEventPayload) {
    await this.invalidateProjectCache(payload.projectId);
  }

  @OnEvent('approval.requested')
  @OnEvent('approval.approved')
  @OnEvent('approval.rejected')
  @OnEvent('approval.discussed')
  async onApprovalEvents(payload: ProjectEventPayload) {
    await this.invalidateProjectCache(payload.projectId);
  }

  @OnEvent('log.created')
  @OnEvent('document.uploaded')
  async onLogOrDocumentEvents(payload: ProjectEventPayload) {
    await this.invalidateProjectCache(payload.projectId);
  }
}
