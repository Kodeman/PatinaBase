'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ALL_STAFF_ROLES,
  STAFF_ROLE_LABELS,
  STAFF_ROLE_DEFAULT_TIER,
  type StaffRole,
} from '@patina/types';
import type { StudioMemberRole } from '@/types';

// Curated staff-title picker over the shared StaffRole vocabulary
// (packages/types/src/studio-config.ts) — the same list the designer
// portal's TitlePicker (document/account/title-picker.tsx) offers to a
// studio owner. Selecting a role suggests that role's default tier via
// onTierSuggest, mirroring title-picker.tsx:72's onPick(label, tier).

// Radix Select forbids an empty-string item value, so "No title" rides a
// sentinel and is translated back to null on the way out.
const NO_TITLE_VALUE = '__no_title__';

interface StaffRoleSelectProps {
  /** null renders as "No title"; undefined leaves the placeholder showing. */
  value: string | null | undefined;
  onChange: (staffRole: string | null) => void;
  /** Fires with the picked role's default permission tier. */
  onTierSuggest?: (tier: StudioMemberRole) => void;
  placeholder?: string;
}

export function StaffRoleSelect({
  value,
  onChange,
  onTierSuggest,
  placeholder = 'Select a title...',
}: StaffRoleSelectProps) {
  const handleChange = (role: string) => {
    if (role === NO_TITLE_VALUE) {
      onChange(null);
      return;
    }
    onChange(role);
    if (onTierSuggest && (ALL_STAFF_ROLES as readonly string[]).includes(role)) {
      onTierSuggest(STAFF_ROLE_DEFAULT_TIER[role as StaffRole]);
    }
  };

  return (
    <Select
      value={value === null ? NO_TITLE_VALUE : value}
      onValueChange={handleChange}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_TITLE_VALUE}>No title</SelectItem>
        {ALL_STAFF_ROLES.map((role) => (
          <SelectItem key={role} value={role}>
            {STAFF_ROLE_LABELS[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
