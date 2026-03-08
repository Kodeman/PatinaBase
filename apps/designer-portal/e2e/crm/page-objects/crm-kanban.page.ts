/**
 * CRM Kanban Board Page Object
 *
 * Models the kanban board view for managing client stages
 */

import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

export interface KanbanColumn {
  title: string;
  cardCount: number;
  cardNames: string[];
}

export class CRMKanbanPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // Selectors
  readonly kanbanContainer = 'div[data-testid="kanban-board"]';
  readonly kanbanColumns = 'div[data-testid="kanban-column"]';
  readonly kanbanCards = 'div[data-testid="kanban-card"]';
  readonly addCardButton = 'button[data-testid="add-card"]';
  readonly columnTitle = 'h2[data-testid="column-title"]';
  readonly cardTitle = 'div[data-testid="card-title"]';
  readonly cardHealthScore = 'span[data-testid="card-health-score"]';
  readonly cardStage = 'span[data-testid="card-stage"]';
  readonly dragHandle = 'div[data-testid="drag-handle"]';
  readonly filterButton = 'button[data-testid="filter-kanban"]';
  readonly searchInput = 'input[data-testid="search-kanban"]';
  readonly viewToggle = 'button[data-testid="view-toggle"]';
  readonly emptyState = 'div[data-testid="empty-state"]';
  readonly loadingSpinner = 'div[data-testid="loading"]';

  /**
   * Navigate to kanban board
   */
  async navigate(): Promise<void> {
    await this.goto('/crm/kanban');
  }

  /**
   * Check if kanban board is displayed
   */
  async isBoardDisplayed(): Promise<boolean> {
    return this.isVisible(this.kanbanContainer);
  }

  /**
   * Get all columns from the board
   */
  async getColumns(): Promise<KanbanColumn[]> {
    await this.waitForElement(this.kanbanColumns);

    const columns = await this.page.$$(this.kanbanColumns);
    const results: KanbanColumn[] = [];

    for (const column of columns) {
      const titleElement = await column.$('h2[data-testid="column-title"]');
      const title = await titleElement?.textContent();

      const cards = await column.$$(this.kanbanCards);
      const cardNames: string[] = [];

      for (const card of cards) {
        const cardTitleEl = await card.$('div[data-testid="card-title"]');
        const cardName = await cardTitleEl?.textContent();
        if (cardName) {
          cardNames.push(cardName.trim());
        }
      }

      if (title) {
        results.push({
          title: title.trim(),
          cardCount: cards.length,
          cardNames,
        });
      }
    }

    return results;
  }

  /**
   * Get a specific column by name
   */
  async getColumn(columnName: string): Promise<Locator> {
    return this.page.locator(
      `div[data-testid="kanban-column"]:has(h2:text("${columnName}"))`
    );
  }

  /**
   * Get cards in a specific column
   */
  async getCardsInColumn(columnName: string): Promise<string[]> {
    const column = await this.getColumn(columnName);
    const cards = await column.locator(this.kanbanCards).all();
    const titles: string[] = [];

    for (const card of cards) {
      const titleEl = await card.locator('div[data-testid="card-title"]');
      const title = await titleEl.textContent();
      if (title) {
        titles.push(title.trim());
      }
    }

    return titles;
  }

  /**
   * Get card count for a column
   */
  async getCardCountInColumn(columnName: string): Promise<number> {
    const cards = await this.getCardsInColumn(columnName);
    return cards.length;
  }

  /**
   * Find a card by client name
   */
  async findCard(clientName: string): Promise<Locator> {
    return this.page.locator(`div[data-testid="kanban-card"]:has-text("${clientName}")`);
  }

  /**
   * Click on a card to open details
   */
  async clickCard(clientName: string): Promise<void> {
    const card = await this.findCard(clientName);
    await card.click();
    await this.waitForElement('div[data-testid="client-detail-modal"]');
  }

  /**
   * Drag a card from one column to another
   */
  async dragCardToColumn(
    clientName: string,
    fromColumn: string,
    toColumn: string
  ): Promise<void> {
    const card = await this.findCard(clientName);
    const targetColumn = await this.getColumn(toColumn);

    // Get the drop zone in the target column
    const dropZone = targetColumn.locator('div[data-testid="drop-zone"]');

    await card.dragTo(dropZone);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Search for cards
   */
  async searchCards(query: string): Promise<void> {
    await this.fill(this.searchInput, query);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get search results
   */
  async getSearchResults(): Promise<string[]> {
    const cards = await this.page.locator(this.kanbanCards).all();
    const results: string[] = [];

    for (const card of cards) {
      const titleEl = await card.locator('div[data-testid="card-title"]');
      const title = await titleEl.textContent();
      if (title) {
        results.push(title.trim());
      }
    }

    return results;
  }

  /**
   * Clear search filter
   */
  async clearSearch(): Promise<void> {
    await this.fill(this.searchInput, '');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Open filter menu
   */
  async openFilters(): Promise<void> {
    await this.click(this.filterButton);
    await this.waitForElement('div[data-testid="filter-menu"]');
  }

  /**
   * Apply filter by health score
   */
  async filterByHealthScore(min: number, max: number): Promise<void> {
    await this.openFilters();
    await this.fill('input[data-testid="health-score-min"]', min.toString());
    await this.fill('input[data-testid="health-score-max"]', max.toString());
    await this.click('button[data-testid="apply-filters"]');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Apply filter by stage
   */
  async filterByStage(stage: string): Promise<void> {
    await this.openFilters();
    await this.click(`label:has-text("${stage}")`);
    await this.click('button[data-testid="apply-filters"]');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Reset all filters
   */
  async resetFilters(): Promise<void> {
    await this.openFilters();
    await this.click('button[data-testid="reset-filters"]');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get health score of a card
   */
  async getCardHealthScore(clientName: string): Promise<number | null> {
    const card = await this.findCard(clientName);
    const scoreText = await card.locator(this.cardHealthScore).textContent();

    if (!scoreText) return null;

    const match = scoreText.match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
  }

  /**
   * Toggle between different views
   */
  async toggleView(viewType: 'kanban' | 'list' | 'calendar'): Promise<void> {
    await this.click(`button[data-testid="view-${viewType}"]`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Verify kanban structure
   */
  async verifyKanbanStructure(): Promise<void> {
    const columns = await this.getColumns();

    // Should have at least Lead, Discovery, Active Project, Completed
    const expectedStages = ['Lead', 'Discovery', 'Active Project', 'Completed'];
    const actualStages = columns.map((c) => c.title);

    for (const stage of expectedStages) {
      if (!actualStages.includes(stage)) {
        throw new Error(`Missing expected stage: ${stage}`);
      }
    }
  }

  /**
   * Get total card count across all columns
   */
  async getTotalCardCount(): Promise<number> {
    const columns = await this.getColumns();
    return columns.reduce((sum, col) => sum + col.cardCount, 0);
  }

  /**
   * Check if column is empty
   */
  async isColumnEmpty(columnName: string): Promise<boolean> {
    const count = await this.getCardCountInColumn(columnName);
    return count === 0;
  }

  /**
   * Wait for board to load
   */
  async waitForBoardReady(): Promise<void> {
    await this.waitForElement(this.kanbanContainer);
    await this.waitForElementHidden(this.loadingSpinner);
  }

  /**
   * Verify real-time update of card position
   */
  async verifyCardPositionUpdate(clientName: string, expectedColumn: string): Promise<void> {
    const card = await this.findCard(clientName);
    const cardElement = await card.boundingBox();

    const targetColumn = await this.getColumn(expectedColumn);
    const columnBounds = await targetColumn.boundingBox();

    if (!cardElement || !columnBounds) {
      throw new Error('Could not find card or column bounds');
    }

    // Check if card is within column bounds
    const isInColumn =
      cardElement.x >= columnBounds.x &&
      cardElement.x + cardElement.width <= columnBounds.x + columnBounds.width;

    if (!isInColumn) {
      throw new Error(
        `Card ${clientName} is not in expected column ${expectedColumn}`
      );
    }
  }

  /**
   * Get card details from thumbnail
   */
  async getCardDetails(clientName: string): Promise<{
    name: string;
    healthScore: number | null;
    lastTouchpoint?: string;
  }> {
    const card = await this.findCard(clientName);

    const name = await card.locator('div[data-testid="card-title"]').textContent();
    const healthScoreText = await card
      .locator('span[data-testid="card-health-score"]')
      .textContent();
    const lastTouchpoint = await card
      .locator('span[data-testid="card-last-touchpoint"]')
      .textContent();

    let healthScore: number | null = null;
    if (healthScoreText) {
      const match = healthScoreText.match(/\d+/);
      healthScore = match ? parseInt(match[0], 10) : null;
    }

    return {
      name: name?.trim() || '',
      healthScore,
      lastTouchpoint: lastTouchpoint?.trim(),
    };
  }

  /**
   * Verify card visual hierarchy
   */
  async verifyCardVisualHierarchy(clientName: string): Promise<void> {
    const card = await this.findCard(clientName);

    // Check required visual elements
    const title = await card.locator('div[data-testid="card-title"]');
    const healthScore = await card.locator('span[data-testid="card-health-score"]');
    const stage = await card.locator('span[data-testid="card-stage"]');

    if (!(await title.isVisible())) {
      throw new Error('Card title not visible');
    }

    if (!(await healthScore.isVisible())) {
      throw new Error('Health score not visible');
    }

    if (!(await stage.isVisible())) {
      throw new Error('Stage indicator not visible');
    }
  }

  /**
   * Get column statistics
   */
  async getColumnStats(): Promise<Map<string, number>> {
    const columns = await this.getColumns();
    const stats = new Map<string, number>();

    for (const column of columns) {
      stats.set(column.title, column.cardCount);
    }

    return stats;
  }
}
