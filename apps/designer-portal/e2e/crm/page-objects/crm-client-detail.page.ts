/**
 * CRM Client Detail Page Object
 *
 * Models the detailed client view with history, touchpoints, and health metrics
 */

import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

export interface ClientInfo {
  name: string;
  email: string;
  phone: string;
  company?: string;
  stage: string;
  healthScore: number;
  createdDate: string;
}

export interface ClientTouchpoint {
  type: string;
  date: string;
  notes: string;
  duration?: string;
}

export class CRMClientDetailPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // Selectors
  readonly clientDetailContainer = 'div[data-testid="client-detail"]';
  readonly clientNameHeader = 'h1[data-testid="client-name"]';
  readonly clientEmail = 'span[data-testid="client-email"]';
  readonly clientPhone = 'span[data-testid="client-phone"]';
  readonly clientStage = 'span[data-testid="client-stage"]';
  readonly healthScoreDisplay = 'div[data-testid="health-score-display"]';
  readonly healthScoreValue = 'span[data-testid="health-score-value"]';
  readonly healthScoreTrend = 'span[data-testid="health-score-trend"]';
  readonly touchpointsList = 'div[data-testid="touchpoints-list"]';
  readonly touchpointItem = 'div[data-testid="touchpoint-item"]';
  readonly addTouchpointButton = 'button[data-testid="add-touchpoint"]';
  readonly editClientButton = 'button[data-testid="edit-client"]';
  readonly deleteClientButton = 'button[data-testid="delete-client"]';
  readonly closeButton = 'button[data-testid="close-detail"]';
  readonly tabsContainer = 'div[data-testid="client-tabs"]';
  readonly historyTab = 'button[data-testid="tab-history"]';
  readonly notesTab = 'button[data-testid="tab-notes"]';
  readonly attachmentsTab = 'button[data-testid="tab-attachments"]';
  readonly timelineChart = 'div[data-testid="health-timeline"]';
  readonly loadingSpinner = 'div[data-testid="loading"]';
  readonly errorAlert = 'div[role="alert"][data-testid="error"]';

  /**
   * Navigate to a client detail page
   */
  async navigateToClient(clientId: string): Promise<void> {
    await this.goto(`/crm/clients/${clientId}`);
  }

  /**
   * Check if client detail is displayed
   */
  async isDetailDisplayed(): Promise<boolean> {
    return this.isVisible(this.clientDetailContainer);
  }

  /**
   * Get client information
   */
  async getClientInfo(): Promise<ClientInfo> {
    await this.waitForElement(this.clientNameHeader);

    const name = await this.getText(this.clientNameHeader);
    const email = await this.getText(this.clientEmail);
    const phone = await this.getText(this.clientPhone);
    const stage = await this.getText(this.clientStage);
    const healthScoreText = await this.getText(this.healthScoreValue);
    const createdDate = await this.getText('span[data-testid="created-date"]');

    return {
      name: name || '',
      email: email || '',
      phone: phone || '',
      stage: stage || '',
      healthScore: parseInt(healthScoreText || '0', 10),
      createdDate: createdDate || '',
    };
  }

  /**
   * Get client name
   */
  async getClientName(): Promise<string | null> {
    return this.getText(this.clientNameHeader);
  }

  /**
   * Get health score value
   */
  async getHealthScore(): Promise<number> {
    const scoreText = await this.getText(this.healthScoreValue);
    return parseInt(scoreText || '0', 10);
  }

  /**
   * Get health score trend (up/down/stable)
   */
  async getHealthScoreTrend(): Promise<string | null> {
    const trendElement = await this.page.$(this.healthScoreTrend);
    if (!trendElement) return null;

    const ariaLabel = await trendElement.getAttribute('aria-label');
    return ariaLabel;
  }

  /**
   * Get all touchpoints
   */
  async getTouchpoints(): Promise<ClientTouchpoint[]> {
    await this.waitForElement(this.touchpointsList);

    const items = await this.page.$$(this.touchpointItem);
    const touchpoints: ClientTouchpoint[] = [];

    for (const item of items) {
      const type = await item.$eval('span[data-testid="touchpoint-type"]', (el) =>
        el.textContent?.trim()
      );
      const date = await item.$eval('span[data-testid="touchpoint-date"]', (el) =>
        el.textContent?.trim()
      );
      const notes = await item.$eval('span[data-testid="touchpoint-notes"]', (el) =>
        el.textContent?.trim()
      );
      const duration = await item.$eval(
        'span[data-testid="touchpoint-duration"]',
        (el) => el.textContent?.trim(),
        { try: true }
      );

      if (type && date && notes) {
        touchpoints.push({
          type,
          date,
          notes,
          duration,
        });
      }
    }

    return touchpoints;
  }

  /**
   * Get the most recent touchpoint
   */
  async getLastTouchpoint(): Promise<ClientTouchpoint | null> {
    const touchpoints = await this.getTouchpoints();
    return touchpoints.length > 0 ? touchpoints[0] : null;
  }

  /**
   * Add a new touchpoint
   */
  async addTouchpoint(
    type: string,
    notes: string,
    duration?: number
  ): Promise<void> {
    await this.click(this.addTouchpointButton);
    await this.waitForElement('div[data-testid="touchpoint-modal"]');

    // Select touchpoint type
    await this.selectDropdown('select[name="touchpointType"]', type);

    // Fill notes
    await this.fill('textarea[name="notes"]', notes);

    // Fill duration if provided
    if (duration !== undefined) {
      await this.fill('input[name="duration"]', duration.toString());
    }

    // Submit
    await this.click('button[data-testid="submit-touchpoint"]');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Edit client information
   */
  async editClient(): Promise<void> {
    await this.click(this.editClientButton);
    await this.waitForElement('div[data-testid="edit-modal"]');
  }

  /**
   * Update client field
   */
  async updateClientField(fieldName: string, value: string): Promise<void> {
    await this.fill(`input[name="${fieldName}"]`, value);
    await this.click('button[data-testid="save-edit"]');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Close the detail panel
   */
  async closeDetail(): Promise<void> {
    await this.click(this.closeButton);
  }

  /**
   * Switch to a specific tab
   */
  async switchTab(tabName: 'history' | 'notes' | 'attachments'): Promise<void> {
    const tabSelector = {
      history: this.historyTab,
      notes: this.notesTab,
      attachments: this.attachmentsTab,
    };

    await this.click(tabSelector[tabName]);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get client notes
   */
  async getNotes(): Promise<string> {
    await this.switchTab('notes');
    const notesContent = await this.getText('div[data-testid="notes-content"]');
    return notesContent || '';
  }

  /**
   * Add or update notes
   */
  async updateNotes(content: string): Promise<void> {
    await this.switchTab('notes');
    await this.fill('textarea[data-testid="notes-editor"]', content);
    await this.click('button[data-testid="save-notes"]');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get attachments
   */
  async getAttachments(): Promise<string[]> {
    await this.switchTab('attachments');
    const attachmentElements = await this.page.$$('div[data-testid="attachment-item"]');
    const names: string[] = [];

    for (const element of attachmentElements) {
      const name = await element.textContent();
      if (name) {
        names.push(name.trim());
      }
    }

    return names;
  }

  /**
   * Upload attachment
   */
  async uploadAttachment(filePath: string): Promise<void> {
    await this.switchTab('attachments');
    const fileInput = await this.page.$('input[type="file"]');

    if (fileInput) {
      await fileInput.setInputFiles(filePath);
      await this.page.waitForLoadState('networkidle');
    }
  }

  /**
   * Get health score chart data
   */
  async getHealthScoreChart(): Promise<any> {
    const chartElement = await this.page.$(this.timelineChart);
    if (!chartElement) return null;

    const dataPoints = await this.page.evaluate(() => {
      const dataAttribute = document.querySelector(
        'div[data-testid="health-timeline"]'
      )?.getAttribute('data-points');
      return dataAttribute ? JSON.parse(dataAttribute) : null;
    });

    return dataPoints;
  }

  /**
   * Verify health score changed
   */
  async verifyHealthScoreChanged(
    previousScore: number,
    expectedDirection: 'up' | 'down' | 'same'
  ): Promise<void> {
    await this.page.reload();
    await this.waitForElement(this.healthScoreValue);

    const newScore = await this.getHealthScore();

    const isCorrect =
      (expectedDirection === 'up' && newScore > previousScore) ||
      (expectedDirection === 'down' && newScore < previousScore) ||
      (expectedDirection === 'same' && newScore === previousScore);

    if (!isCorrect) {
      throw new Error(
        `Expected health score to go ${expectedDirection}, but went from ${previousScore} to ${newScore}`
      );
    }
  }

  /**
   * Check if client is in specific stage
   */
  async isClientInStage(stageName: string): Promise<boolean> {
    const stage = await this.getText(this.clientStage);
    return stage === stageName;
  }

  /**
   * Move client to different stage
   */
  async moveToStage(newStage: string): Promise<void> {
    await this.click(this.clientStage);
    await this.waitForElement('div[data-testid="stage-selector"]');
    await this.click(`button[data-value="${newStage}"]`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Verify client detail structure
   */
  async verifyDetailStructure(): Promise<void> {
    const sections = [
      this.clientNameHeader,
      this.clientEmail,
      this.clientPhone,
      this.clientStage,
      this.healthScoreDisplay,
      this.touchpointsList,
      this.tabsContainer,
    ];

    for (const section of sections) {
      if (!(await this.isVisible(section))) {
        throw new Error(`Missing section: ${section}`);
      }
    }
  }

  /**
   * Get client history timeline
   */
  async getClientHistory(): Promise<any[]> {
    await this.switchTab('history');

    const historyItems = await this.page.$$('div[data-testid="history-item"]');
    const history: any[] = [];

    for (const item of historyItems) {
      const event = await item.$eval('span[data-testid="event-type"]', (el) =>
        el.textContent?.trim()
      );
      const timestamp = await item.$eval('span[data-testid="timestamp"]', (el) =>
        el.textContent?.trim()
      );
      const description = await item.$eval('span[data-testid="description"]', (el) =>
        el.textContent?.trim(),
        { try: true }
      );

      if (event && timestamp) {
        history.push({ event, timestamp, description });
      }
    }

    return history;
  }

  /**
   * Check if error is displayed
   */
  async hasError(): Promise<boolean> {
    return this.isVisible(this.errorAlert);
  }

  /**
   * Get error message
   */
  async getErrorMessage(): Promise<string | null> {
    return this.getText(this.errorAlert);
  }

  /**
   * Wait for detail to be ready
   */
  async waitForDetailReady(): Promise<void> {
    await this.waitForElement(this.clientDetailContainer);
    await this.waitForElementHidden(this.loadingSpinner);
  }

  /**
   * Delete client (with confirmation)
   */
  async deleteClient(confirm = true): Promise<void> {
    await this.click(this.deleteClientButton);
    await this.waitForElement('div[data-testid="confirmation-dialog"]');

    if (confirm) {
      await this.click('button[data-testid="confirm-delete"]');
    } else {
      await this.click('button[data-testid="cancel-delete"]');
    }

    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Export client data
   */
  async exportClientData(format: 'pdf' | 'csv'): Promise<void> {
    const menuButton = await this.page.$('button[data-testid="client-menu"]');
    if (menuButton) {
      await menuButton.click();
    }

    await this.click(`button[data-testid="export-${format}"]`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Verify touchpoint was added
   */
  async verifyTouchpointAdded(
    type: string,
    expectedNotes: string
  ): Promise<boolean> {
    const touchpoints = await this.getTouchpoints();
    return touchpoints.some(
      (t) =>
        t.type.toLowerCase().includes(type.toLowerCase()) &&
        t.notes.includes(expectedNotes)
    );
  }

  /**
   * Get client stage progression
   */
  async getStageProgression(): Promise<string[]> {
    const history = await this.getClientHistory();
    return history
      .filter((h) => h.event.includes('stage'))
      .map((h) => h.description)
      .filter(Boolean);
  }
}
