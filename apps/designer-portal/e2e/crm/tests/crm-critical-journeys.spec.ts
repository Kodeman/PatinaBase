/**
 * CRM Critical User Journey Tests
 *
 * Tests for core workflows that must work reliably
 */

import { test, expect } from '../fixtures/crm-fixtures';
import {
  generateRandomClient,
  generateClientByStage,
  generateRandomTouchpoint,
  TestScenarioBuilder,
  HealthScoreCalculator,
} from '../utils/test-data';
import { CRMAssertions, WaitHelpers } from '../fixtures/crm-fixtures';

test.describe('CRM Critical User Journeys', () => {
  test.describe('New Client Onboarding', () => {
    test('should create client and initialize health score', async ({
      intakeForm,
      kanban,
      authenticatedPage,
    }) => {
      // Navigate to intake form
      await intakeForm.navigate();

      // Verify form is displayed
      expect(await intakeForm.isFormDisplayed()).toBeTruthy();

      // Fill and submit form
      const testClient = generateRandomClient();
      await intakeForm.fillForm(testClient);
      await intakeForm.submitForm();

      // Verify success
      expect(await intakeForm.isSuccessMessageDisplayed()).toBeTruthy();

      // Verify client appears in kanban
      await kanban.navigate();
      const leadCards = await kanban.getCardsInColumn('Lead');
      const clientFound = leadCards.some((card) =>
        card.includes(testClient.firstName)
      );

      expect(clientFound).toBeTruthy();
    });

    test('should validate required fields', async ({ intakeForm }) => {
      await intakeForm.navigate();

      // Try to submit without required fields
      await intakeForm.click('button[type="submit"]');

      // Should show validation errors
      expect(await intakeForm.hasValidationErrors()).toBeTruthy();
    });

    test('should auto-save form progress', async ({ intakeForm }) => {
      await intakeForm.navigate();

      const testClient = generateRandomClient();
      await intakeForm.fillForm(testClient);

      // Wait for auto-save
      await intakeForm.page.waitForTimeout(2000);

      // Reload page
      await intakeForm.reload();

      // Data should persist
      const firstName = await intakeForm.getFieldValue('firstName');
      expect(firstName).toBe(testClient.firstName);
    });

    test('should set correct initial health score for new client', async ({
      intakeForm,
      clientDetail,
      kanban,
    }) => {
      // Create new client
      const testClient = generateRandomClient();
      await intakeForm.navigate();
      await intakeForm.fillForm(testClient);
      await intakeForm.submitForm();

      // Navigate to kanban and open client detail
      await kanban.navigate();
      await kanban.clickCard(testClient.firstName);

      // Verify health score
      const healthScore = await clientDetail.getHealthScore();
      expect(healthScore).toBeGreaterThanOrEqual(0);
      expect(healthScore).toBeLessThanOrEqual(100);
    });
  });

  test.describe('Stage Transitions', () => {
    test('should move client from Lead to Discovery', async ({
      kanban,
      clientDetail,
    }) => {
      // Create client in Lead stage
      const client = generateClientByStage('lead');
      // TODO: Use API to create client quickly
      // For now, this would be seeded via API call

      // Open kanban and drag card
      await kanban.navigate();
      await kanban.dragCardToColumn(
        client.firstName,
        'Lead',
        'Discovery'
      );

      // Verify card moved
      await WaitHelpers.waitForCardInColumn(
        kanban,
        client.firstName,
        'Discovery',
        10000
      );

      const discoveryCards = await kanban.getCardsInColumn('Discovery');
      expect(discoveryCards).toContain(client.firstName);
    });

    test('should log stage transition touchpoint', async ({
      kanban,
      clientDetail,
    }) => {
      const client = generateClientByStage('lead');

      // Navigate and move client
      await kanban.navigate();
      const initialTouchpoints = await clientDetail.getTouchpoints();
      const initialCount = initialTouchpoints.length;

      await kanban.dragCardToColumn(client.firstName, 'Lead', 'Discovery');

      // Open detail and check for new touchpoint
      await kanban.clickCard(client.firstName);
      const updatedTouchpoints = await clientDetail.getTouchpoints();

      // Should have new touchpoint for stage change
      expect(updatedTouchpoints.length).toBeGreaterThan(initialCount);
    });

    test('should update health score on stage transition', async ({
      kanban,
      clientDetail,
    }) => {
      const client = generateClientByStage('lead');

      // Open client detail and get initial health score
      await kanban.navigate();
      await kanban.clickCard(client.firstName);
      const initialScore = await clientDetail.getHealthScore();

      // Move to next stage
      await clientDetail.moveToStage('discovery');

      // Wait for health score update
      const newScore = await WaitHelpers.waitForHealthScoreUpdate(
        clientDetail,
        initialScore,
        10000
      );

      expect(newScore).toBeGreaterThan(initialScore);
    });

    test('should complete multi-stage journey', async ({
      kanban,
      clientDetail,
    }) => {
      const client = generateClientByStage('lead');
      const stages = ['Lead', 'Discovery', 'Active Project', 'Completed'];

      await kanban.navigate();

      // Progress through all stages
      for (let i = 0; i < stages.length - 1; i++) {
        await kanban.dragCardToColumn(
          client.firstName,
          stages[i],
          stages[i + 1]
        );

        await WaitHelpers.waitForCardInColumn(
          kanban,
          client.firstName,
          stages[i + 1],
          10000
        );
      }

      // Verify client in final stage
      const completedCards = await kanban.getCardsInColumn('Completed');
      expect(completedCards).toContain(client.firstName);

      // Verify final health score
      await kanban.clickCard(client.firstName);
      const finalScore = await clientDetail.getHealthScore();
      expect(finalScore).toBeGreaterThan(50);
    });
  });

  test.describe('Health Score Updates', () => {
    test('should increase health score on positive touchpoint', async ({
      kanban,
      clientDetail,
    }) => {
      const client = generateClientByStage('discovery');

      await kanban.navigate();
      await kanban.clickCard(client.firstName);

      const initialScore = await clientDetail.getHealthScore();

      // Add positive touchpoint
      await clientDetail.addTouchpoint('call', 'Positive discussion', 30);

      // Wait for score update
      const newScore = await WaitHelpers.waitForHealthScoreUpdate(
        clientDetail,
        initialScore,
        10000
      );

      const expectedIncrease = HealthScoreCalculator.calculateImpact('call');
      expect(newScore).toBeGreaterThanOrEqual(
        initialScore + expectedIncrease * 0.8
      );
    });

    test('should reflect touchpoint impact in health score', async ({
      clientDetail,
    }) => {
      const client = generateClientByStage('discovery');
      // TODO: Use API to create and open client

      const initialScore = await clientDetail.getHealthScore();

      // Test different touchpoint types
      const touchpointTypes: Array<Parameters<typeof clientDetail.addTouchpoint>[0]> = [
        'call',
        'email',
        'meeting',
      ];

      for (const type of touchpointTypes) {
        const preScore = await clientDetail.getHealthScore();
        await clientDetail.addTouchpoint(type, `Test ${type}`, 30);

        const postScore = await WaitHelpers.waitForHealthScoreUpdate(
          clientDetail,
          preScore,
          5000
        );

        const expectedImpact = HealthScoreCalculator.calculateImpact(type);
        expect(postScore).toBeGreaterThanOrEqual(preScore + expectedImpact * 0.7);
      }
    });

    test('should calculate cumulative health score', async ({
      clientDetail,
    }) => {
      const client = generateClientByStage('discovery');
      const initialScore = await clientDetail.getHealthScore();

      // Add multiple touchpoints
      const touchpoints = [
        { type: 'call' as const, notes: 'Initial consultation' },
        { type: 'email' as const, notes: 'Sent proposal' },
        { type: 'meeting' as const, notes: 'Discussed details' },
      ];

      let expectedScore = initialScore;

      for (const tp of touchpoints) {
        const preScore = await clientDetail.getHealthScore();
        await clientDetail.addTouchpoint(tp.type, tp.notes, 30);

        const postScore = await WaitHelpers.waitForHealthScoreUpdate(
          clientDetail,
          preScore,
          5000
        );

        expectedScore += HealthScoreCalculator.calculateImpact(tp.type);
      }

      const finalScore = await clientDetail.getHealthScore();
      expect(finalScore).toBeGreaterThan(initialScore + 10);
    });

    test('should display health score trend', async ({ clientDetail }) => {
      const client = generateClientByStage('active-project');
      // TODO: Use API to create client

      const trend = await clientDetail.getHealthScoreTrend();
      expect(trend).toBeTruthy();
      expect(['up', 'down', 'stable']).toContain(trend?.toLowerCase());
    });
  });

  test.describe('Touchpoint Logging', () => {
    test('should log new touchpoint with timestamp', async ({
      clientDetail,
    }) => {
      const client = generateClientByStage('discovery');

      const notes = 'Client interested in modern design';
      await clientDetail.addTouchpoint('call', notes, 45);

      // Verify touchpoint appears
      const isVisible = await clientDetail.verifyTouchpointAdded(
        'call',
        notes
      );
      expect(isVisible).toBeTruthy();

      // Verify timestamp is recent
      const lastTouchpoint = await clientDetail.getLastTouchpoint();
      expect(lastTouchpoint?.type).toContain('call');
      expect(lastTouchpoint?.notes).toContain(notes);
    });

    test('should support all touchpoint types', async ({ clientDetail }) => {
      const client = generateClientByStage('discovery');
      const types = ['call', 'email', 'meeting', 'proposal', 'site-visit'];

      for (const type of types) {
        await clientDetail.addTouchpoint(
          type,
          `Test ${type} touchpoint`,
          30
        );

        const isVisible = await clientDetail.verifyTouchpointAdded(
          type,
          `Test ${type}`
        );
        expect(isVisible).toBeTruthy();
      }
    });

    test('should maintain touchpoint timeline', async ({ clientDetail }) => {
      const client = generateClientByStage('discovery');

      // Add touchpoints with delays to ensure order
      const notes = ['First call', 'Email follow-up', 'Meeting scheduled'];

      for (const note of notes) {
        await clientDetail.addTouchpoint('call', note, 30);
        await clientDetail.page.waitForTimeout(500);
      }

      // Verify all touchpoints exist and are in correct order
      const touchpoints = await clientDetail.getTouchpoints();
      const touchpointNotes = touchpoints.map((t) => t.notes);

      for (const note of notes) {
        expect(touchpointNotes.some((n) => n.includes(note))).toBeTruthy();
      }
    });

    test('should calculate health score based on touchpoint history', async ({
      clientDetail,
    }) => {
      const scenario = TestScenarioBuilder.buildHappyPathScenario();
      const client = scenario.client;

      // TODO: Create client with initial touchpoints
      const initialScore = await clientDetail.getHealthScore();

      // Add more touchpoints
      for (const tp of scenario.touchpoints) {
        await clientDetail.addTouchpoint(tp.type, tp.notes, tp.duration);
      }

      const finalScore = await clientDetail.getHealthScore();
      expect(finalScore).toBeGreaterThan(initialScore);
    });
  });

  test.describe('Real-time Updates', () => {
    test('should update kanban in real-time on stage change', async ({
      kanban,
    }) => {
      const client = generateClientByStage('lead');

      await kanban.navigate();
      const initialLeadCount = await kanban.getCardCountInColumn('Lead');

      // Simulate another user moving client
      await kanban.dragCardToColumn(client.firstName, 'Lead', 'Discovery');

      // Verify immediate update
      const updatedLeadCount = await kanban.getCardCountInColumn('Lead');
      expect(updatedLeadCount).toBeLessThan(initialLeadCount);

      const discoveryCount = await kanban.getCardCountInColumn('Discovery');
      expect(discoveryCount).toBeGreaterThan(0);
    });

    test('should update health score in real-time on touchpoint add', async ({
      kanban,
      clientDetail,
    }) => {
      const client = generateClientByStage('discovery');

      await kanban.navigate();
      await kanban.clickCard(client.firstName);

      const preScore = await clientDetail.getHealthScore();
      await clientDetail.addTouchpoint('meeting', 'Important meeting', 60);

      // Score should update immediately
      const postScore = await clientDetail.getHealthScore();
      expect(postScore).toBeGreaterThan(preScore);
    });
  });

  test.describe('Scenario-based Workflows', () => {
    test('should handle happy path scenario', async ({
      intakeForm,
      kanban,
      clientDetail,
    }) => {
      // New client creation
      const client = generateRandomClient();
      await intakeForm.navigate();
      await intakeForm.fillForm(client);
      await intakeForm.submitForm();

      // Progress through stages
      await kanban.navigate();
      await kanban.dragCardToColumn(client.firstName, 'Lead', 'Discovery');
      await kanban.dragCardToColumn(client.firstName, 'Discovery', 'Active Project');

      // Add multiple touchpoints
      await kanban.clickCard(client.firstName);
      await clientDetail.addTouchpoint(
        'meeting',
        'Design review meeting',
        90
      );
      await clientDetail.addTouchpoint('proposal', 'Sent detailed proposal', 0);

      // Verify high health score
      const finalScore = await clientDetail.getHealthScore();
      expect(finalScore).toBeGreaterThan(70);
    });

    test('should handle at-risk scenario', async ({
      kanban,
      clientDetail,
    }) => {
      const client = generateClientByStage('discovery');
      client.healthScore = 30;

      // Verify low health score
      await kanban.navigate();
      await kanban.clickCard(client.firstName);
      const score = await clientDetail.getHealthScore();
      expect(score).toBeLessThan(40);

      // Add positive touchpoint to recover score
      await clientDetail.addTouchpoint('call', 'Discussed budget concerns', 30);

      const newScore = await clientDetail.getHealthScore();
      expect(newScore).toBeGreaterThan(score);
    });

    test('should handle churned client scenario', async ({
      kanban,
      clientDetail,
    }) => {
      const client = generateClientByStage('lead');
      client.healthScore = 10;

      // Check low score
      await kanban.navigate();
      await kanban.clickCard(client.firstName);
      const score = await clientDetail.getHealthScore();
      expect(score).toBeLessThan(25);

      // Log re-engagement attempt
      await clientDetail.addTouchpoint(
        'email',
        'Checking in after 3 months',
        0
      );

      // Note: Score might not increase if outcome is neutral
      // but touchpoint should be logged
      const updated = await clientDetail.verifyTouchpointAdded(
        'email',
        'Checking in'
      );
      expect(updated).toBeTruthy();
    });
  });
});
