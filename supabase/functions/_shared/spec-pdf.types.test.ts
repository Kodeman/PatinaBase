// deno-lint-ignore-file no-import-prefix
// This file is intentionally run WITHOUT `--no-check`. The assertions below
// fail compilation if any client-facing composition type gains an internal
// trade-price, markup, or margin field.

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import type {
  SpecBoardCompositionInput,
  SpecBoardCompositionModel,
  SpecBoardCompositionPin,
  SpecBoardCompositionPinInput,
  SpecBoardCompositionSection,
  SpecBoardCompositionWarningMetadata,
} from './spec-pdf.ts';

type ForbiddenMoneyWord = 'trade' | 'markup' | 'margin';
type ForbiddenMoneyKey<T> = T extends unknown ? {
    [Key in keyof T & string]: Lowercase<Key> extends
      `${string}${ForbiddenMoneyWord}${string}` ? Key : never;
  }[keyof T & string]
  : never;
type AssertNever<Value extends never> = Value;

type _InputIsClientSafe = AssertNever<ForbiddenMoneyKey<SpecBoardCompositionInput>>;
type _PinInputIsClientSafe = AssertNever<ForbiddenMoneyKey<SpecBoardCompositionPinInput>>;
type _ModelIsClientSafe = AssertNever<ForbiddenMoneyKey<SpecBoardCompositionModel>>;
type _PinIsClientSafe = AssertNever<ForbiddenMoneyKey<SpecBoardCompositionPin>>;
type _SectionIsClientSafe = AssertNever<ForbiddenMoneyKey<SpecBoardCompositionSection>>;
type _WarningsAreClientSafe = AssertNever<
  ForbiddenMoneyKey<SpecBoardCompositionWarningMetadata>
>;

Deno.test('checked type gate: board-composition surface has no internal money field', () => {
  // Runtime registration proves the checked file was collected by `deno test`;
  // the actual invariant is enforced by the generic constraints above.
  assertEquals(true, true);
});
