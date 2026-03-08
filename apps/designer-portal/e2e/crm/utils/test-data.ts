/**
 * CRM Test Data Utilities
 *
 * Helpers for creating and managing test data
 */

export interface TestClient {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  designStyle?: string;
  budget?: string;
  projectScope?: string;
  notes?: string;
  stage?: string;
  healthScore?: number;
  createdAt?: Date;
}

export interface TestTouchpoint {
  id?: string;
  clientId: string;
  type: 'call' | 'email' | 'meeting' | 'proposal' | 'site-visit';
  date?: Date;
  notes: string;
  duration?: number; // in minutes
  outcome?: 'positive' | 'negative' | 'neutral';
}

/**
 * Generate random email
 */
export function generateRandomEmail(): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `test+${timestamp}-${random}@example.com`;
}

/**
 * Generate random phone
 */
export function generateRandomPhone(): string {
  const areaCode = Math.floor(Math.random() * 900) + 100;
  const exchange = Math.floor(Math.random() * 900) + 100;
  const subscriber = Math.floor(Math.random() * 9000) + 1000;
  return `${areaCode}-${exchange}-${subscriber}`;
}

/**
 * Generate random client
 */
export function generateRandomClient(overrides?: Partial<TestClient>): TestClient {
  const firstNames = [
    'John',
    'Jane',
    'Robert',
    'Sarah',
    'Michael',
    'Emily',
    'David',
    'Jessica',
  ];
  const lastNames = [
    'Smith',
    'Johnson',
    'Williams',
    'Brown',
    'Jones',
    'Garcia',
    'Miller',
    'Davis',
  ];

  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];

  return {
    firstName,
    lastName,
    email: generateRandomEmail(),
    phone: generateRandomPhone(),
    ...overrides,
  };
}

/**
 * Generate client by stage
 */
export function generateClientByStage(
  stage: 'lead' | 'discovery' | 'active-project' | 'completed'
): TestClient {
  const client = generateRandomClient({ stage });

  // Set health score based on stage
  switch (stage) {
    case 'lead':
      client.healthScore = Math.floor(Math.random() * 30) + 10; // 10-40
      break;
    case 'discovery':
      client.healthScore = Math.floor(Math.random() * 30) + 30; // 30-60
      break;
    case 'active-project':
      client.healthScore = Math.floor(Math.random() * 40) + 50; // 50-90
      break;
    case 'completed':
      client.healthScore = Math.floor(Math.random() * 30) + 70; // 70-100
      break;
  }

  return client;
}

/**
 * Generate client with specific health score
 */
export function generateClientWithHealthScore(healthScore: number): TestClient {
  if (healthScore < 0 || healthScore > 100) {
    throw new Error('Health score must be between 0 and 100');
  }

  return generateRandomClient({ healthScore });
}

/**
 * Generate multiple clients
 */
export function generateMultipleClients(
  count: number,
  overrides?: Partial<TestClient>
): TestClient[] {
  return Array.from({ length: count }, () => generateRandomClient(overrides));
}

/**
 * Generate clients by stage distribution
 */
export function generateClientsByStageDistribution(
  total: number
): Map<string, TestClient[]> {
  const distribution = {
    lead: Math.floor(total * 0.4),
    discovery: Math.floor(total * 0.3),
    'active-project': Math.floor(total * 0.25),
    completed: Math.floor(total * 0.05),
  };

  const clients = new Map<string, TestClient[]>();

  Object.entries(distribution).forEach(([stage, count]) => {
    const stageClients: TestClient[] = [];

    for (let i = 0; i < count; i++) {
      stageClients.push(
        generateClientByStage(stage as Parameters<typeof generateClientByStage>[0])
      );
    }

    clients.set(stage, stageClients);
  });

  return clients;
}

/**
 * Generate random touchpoint
 */
export function generateRandomTouchpoint(
  clientId: string,
  overrides?: Partial<TestTouchpoint>
): TestTouchpoint {
  const types: Array<TestTouchpoint['type']> = [
    'call',
    'email',
    'meeting',
    'proposal',
    'site-visit',
  ];
  const outcomes: Array<TestTouchpoint['outcome']> = [
    'positive',
    'negative',
    'neutral',
  ];

  return {
    clientId,
    type: types[Math.floor(Math.random() * types.length)],
    date: new Date(),
    notes: `Test touchpoint created at ${new Date().toISOString()}`,
    duration: Math.floor(Math.random() * 120) + 15, // 15-135 minutes
    outcome: outcomes[Math.floor(Math.random() * outcomes.length)],
    ...overrides,
  };
}

/**
 * Generate multiple touchpoints
 */
export function generateMultipleTouchpoints(
  clientId: string,
  count: number,
  overrides?: Partial<TestTouchpoint>
): TestTouchpoint[] {
  return Array.from({ length: count }, () =>
    generateRandomTouchpoint(clientId, overrides)
  );
}

/**
 * Generate touchpoint sequence (simulating client journey)
 */
export function generateTouchpointSequence(
  clientId: string,
  sequenceLength: number
): TestTouchpoint[] {
  const sequence: TestTouchpoint[] = [];
  const types: Array<TestTouchpoint['type']> = [
    'call',
    'email',
    'meeting',
    'proposal',
    'site-visit',
  ];

  for (let i = 0; i < sequenceLength; i++) {
    const daysAgo = sequenceLength - i; // Most recent at the end
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);

    sequence.push({
      clientId,
      type: types[i % types.length],
      date,
      notes: `Touchpoint ${i + 1} in sequence`,
      duration: 30,
      outcome: 'positive',
    });
  }

  return sequence;
}

/**
 * Health score impact calculator
 */
export class HealthScoreCalculator {
  /**
   * Calculate health score based on touchpoints
   */
  static calculateFromTouchpoints(
    baseLine: number = 50,
    touchpoints: TestTouchpoint[]
  ): number {
    let score = baseLine;

    const weights = {
      call: 5,
      email: 2,
      meeting: 8,
      proposal: 10,
      'site-visit': 12,
    };

    touchpoints.forEach((tp) => {
      const weight = weights[tp.type] || 3;
      const outcomeMultiplier =
        tp.outcome === 'positive' ? 1 : tp.outcome === 'negative' ? -0.5 : 0;

      score += weight * outcomeMultiplier;
    });

    // Clamp between 0 and 100
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Calculate expected health score increase from touchpoint
   */
  static calculateImpact(touchpointType: TestTouchpoint['type']): number {
    const impacts = {
      call: 5,
      email: 2,
      meeting: 8,
      proposal: 10,
      'site-visit': 12,
    };

    return impacts[touchpointType] || 3;
  }

  /**
   * Get health score trend
   */
  static getTrend(
    scores: number[]
  ): 'increasing' | 'decreasing' | 'stable' | 'volatile' {
    if (scores.length < 2) return 'stable';

    const changes = [];
    for (let i = 1; i < scores.length; i++) {
      changes.push(scores[i] - scores[i - 1]);
    }

    const avgChange =
      changes.reduce((a, b) => a + b, 0) / changes.length;
    const variance =
      changes.reduce((sum, change) => sum + Math.pow(change - avgChange, 2), 0) /
      changes.length;

    if (variance > 5) return 'volatile';
    if (avgChange > 1) return 'increasing';
    if (avgChange < -1) return 'decreasing';
    return 'stable';
  }
}

/**
 * Test scenario builder
 */
export class TestScenarioBuilder {
  /**
   * Build "happy path" scenario
   */
  static buildHappyPathScenario(): {
    client: TestClient;
    touchpoints: TestTouchpoint[];
  } {
    const client = generateClientByStage('lead');
    client.healthScore = 20;

    const touchpoints = [
      generateRandomTouchpoint(client.id || '', {
        type: 'call',
        outcome: 'positive',
        notes: 'Initial consultation',
      }),
      generateRandomTouchpoint(client.id || '', {
        type: 'email',
        outcome: 'positive',
        notes: 'Sent design proposal',
      }),
      generateRandomTouchpoint(client.id || '', {
        type: 'meeting',
        outcome: 'positive',
        notes: 'Discussed requirements in detail',
      }),
    ];

    return { client, touchpoints };
  }

  /**
   * Build "at-risk" scenario
   */
  static buildAtRiskScenario(): {
    client: TestClient;
    touchpoints: TestTouchpoint[];
  } {
    const client = generateClientByStage('discovery');
    client.healthScore = 35;

    const touchpoints = [
      generateRandomTouchpoint(client.id || '', {
        type: 'email',
        outcome: 'neutral',
        notes: 'No response to initial contact',
      }),
      generateRandomTouchpoint(client.id || '', {
        type: 'call',
        outcome: 'negative',
        notes: 'Client expressing budget concerns',
      }),
    ];

    return { client, touchpoints };
  }

  /**
   * Build "high-value" scenario
   */
  static buildHighValueScenario(): {
    client: TestClient;
    touchpoints: TestTouchpoint[];
  } {
    const client = generateClientByStage('active-project');
    client.healthScore = 85;
    client.budget = '250000';

    const touchpoints = [
      generateRandomTouchpoint(client.id || '', {
        type: 'site-visit',
        outcome: 'positive',
        notes: 'Completed site assessment',
      }),
      generateRandomTouchpoint(client.id || '', {
        type: 'proposal',
        outcome: 'positive',
        notes: 'Proposal approved by client',
      }),
      generateRandomTouchpoint(client.id || '', {
        type: 'meeting',
        outcome: 'positive',
        notes: 'Contract execution meeting',
      }),
    ];

    return { client, touchpoints };
  }

  /**
   * Build "churned" scenario
   */
  static buildChurnedScenario(): {
    client: TestClient;
    touchpoints: TestTouchpoint[];
  } {
    const client = generateClientByStage('lead');
    client.healthScore = 10;

    const touchpoints = [
      generateRandomTouchpoint(client.id || '', {
        type: 'call',
        outcome: 'negative',
        notes: 'Client not interested',
      }),
      generateRandomTouchpoint(client.id || '', {
        type: 'email',
        outcome: 'neutral',
        notes: 'No response after 2 weeks',
      }),
    ];

    return { client, touchpoints };
  }
}

/**
 * Batch test data generator
 */
export class BatchTestDataGenerator {
  /**
   * Generate data for load testing
   */
  static generateLoadTestData(
    clientCount: number = 1000
  ): Map<string, TestClient[]> {
    return generateClientsByStageDistribution(clientCount);
  }

  /**
   * Generate data with health score distribution
   */
  static generateHealthScoreDistribution(): TestClient[] {
    const ranges = [
      { min: 0, max: 25, label: 'Critical', count: 50 },
      { min: 25, max: 50, label: 'At Risk', count: 150 },
      { min: 50, max: 75, label: 'Healthy', count: 300 },
      { min: 75, max: 100, label: 'Thriving', count: 200 },
    ];

    const clients: TestClient[] = [];

    ranges.forEach(({ min, max, count }) => {
      for (let i = 0; i < count; i++) {
        const score = Math.floor(Math.random() * (max - min)) + min;
        clients.push(generateClientWithHealthScore(score));
      }
    });

    return clients;
  }
}
