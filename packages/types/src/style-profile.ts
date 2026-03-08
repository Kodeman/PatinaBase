import { UUID, Timestamps } from './common';

export type StylePreference =
  | 'modern'
  | 'traditional'
  | 'minimalist'
  | 'eclectic'
  | 'industrial'
  | 'scandinavian'
  | 'bohemian'
  | 'coastal';

export interface StyleProfile extends Timestamps {
  id: UUID;
  userId: UUID;
  primaryStyle: StylePreference;
  secondaryStyles: StylePreference[];
  colorPreferences: ColorPreference[];
  materialPreferences: string[];
  budgetRange: BudgetRange;
  roomTypes: string[];
  aestheticScore?: AestheticScore;
}

export interface ColorPreference {
  name: string;
  hex: string;
  preference: 'love' | 'like' | 'neutral' | 'dislike';
}

export interface BudgetRange {
  min: number;
  max: number;
  currency: string;
}

export interface AestheticScore {
  overall: number;
  categories: Record<string, number>;
  generatedAt: Date;
}
