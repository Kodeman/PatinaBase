#!/usr/bin/env bash
# deck-import-copy-gate.sh — the Bring in a Deck (US-15) copy-lexicon gate (SQ-364).
#
# Fails (exit 1) when a deck-import UI file says any banned word to the
# designer. Matching is case-insensitive on word boundaries:
#
#   \bAI\b   \bsmart\b   \bauto-match   \bcurated\b   "powered by"
#   %        in a user string: a string literal or JSX text. Not flagged:
#            CSS lengths in a style object (left: `${x}%`), Tailwind
#            arbitrary values (w-[50%]), URL escapes (%2F), and the modulo
#            operator in code.
#
# Comments are stripped first (code notes may name the banned words).
#
# Files covered (under apps/designer-portal/src; tests and fixtures excluded):
#   **/*deck-import*        board-deck-import-ledger.tsx, board-deck-import-sheet.tsx,
#                           use-board-deck-import-layout.ts, use-board-deck-import-review.ts
#   **/deck-import/**       src/lib/deck-import (parser messages)
#   **/*find-this-piece*    board-find-this-piece.tsx, use-board-find-this-piece.ts
#   **/*web-match*          use-board-web-match.ts
#
# Usage:
#   scripts/deck-import-copy-gate.sh            scan the files above
#   scripts/deck-import-copy-gate.sh FILE...    scan only these files
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/apps/designer-portal/src"

files=()
if [ "$#" -gt 0 ]; then
  files=("$@")
else
  while IFS= read -r file; do
    files+=("$file")
  done < <(
    find "$SRC" -type f \( -name '*.ts' -o -name '*.tsx' \) \
      \( -name '*deck-import*' -o -path '*/deck-import/*' -o -name '*find-this-piece*' -o -name '*web-match*' \) \
      -not -path '*/__tests__/*' -not -path '*/__fixtures__/*' -not -name '*.test.*' -not -name '*.spec.*' \
      | sort
  )
fi

if [ "${#files[@]}" -eq 0 ]; then
  echo "deck-import copy gate: no files to scan under $SRC" >&2
  exit 2
fi

hits="$(perl -e '
  use strict;
  use warnings;
  my $css = qr/\b(?:left|right|top|bottom|width|height|minWidth|maxWidth|minHeight|maxHeight|inset|flexBasis|transform|translate|backgroundPosition|backgroundSize|transformOrigin)\s*:\s*$/;
  my $banned = qr/\bAI\b|\bsmart\b|\bauto-match|\bcurated\b|powered\s+by/i;
  for my $file (@ARGV) {
    open(my $fh, "<", $file) or die "cannot read $file: $!\n";
    local $/;
    my $src = <$fh>;
    close $fh;
    # Strip comments, keeping line numbers: block comments become blank lines,
    # line comments are cut (but not :// inside URLs).
    $src =~ s{/\*.*?\*/}{ my $c = $&; $c =~ tr/\n//cd; $c }gse;
    $src =~ s{(^|[^:\\])//[^\n]*}{$1}gm;
    my $n = 0;
    for my $line (split /\n/, $src, -1) {
      $n++;
      my @why;
      push @why, "banned word" if $line =~ $banned;
      my $outside = $line;
      while ($line =~ /([\x27"`])((?:\\.|(?!\1).)*)\1/g) {
        my ($literal, $before) = ($2, substr($line, 0, $-[0]));
        my $text = $literal;
        $text =~ s/\[[^\]]*\]//g;          # Tailwind arbitrary values
        $text =~ s/%[0-9A-Fa-f]{2}//g;     # URL escapes
        next unless $text =~ /%/;
        next if $before =~ $css;           # a CSS length in a style object
        push @why, "% in a user string";
      }
      $outside =~ s/([\x27"`])(?:\\.|(?!\1).)*\1//g;
      push @why, "% in JSX text" if $outside =~ /\}%|>[^<>{}=]*%[^<>]*</;
      if (@why) {
        my $shown = $line;
        $shown =~ s/^\s+//;
        printf "%s:%d: [%s] %s\n", $file, $n, join(", ", @why), substr($shown, 0, 160);
      }
    }
  }
' "${files[@]}")"

if [ -n "$hits" ]; then
  echo "deck-import copy gate: banned lexicon in user-facing copy" >&2
  echo "$hits" >&2
  exit 1
fi
echo "deck-import copy gate: clean (${#files[@]} files)"
