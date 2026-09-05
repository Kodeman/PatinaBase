# 03b — fix log (Z1–Z6)

- **Z1** — fixed. Master-table P7 "what changes" cell now reads "...change order on the client price once signed (trade price and markup stay editable, through that write path and into the record), revise the configuration when configured," matching P7's state table and R8.
- **Z2** — fixed. Master-table P1 "why the studio cares" cell now reads "Deletes the translation step the principal in the simulated panel described: ..." — carries the same "simulated panel" marker used at `:898` and throughout §07.
- **Z3** — fixed. §04 closing paragraph now reads "...margin as a first-class editable field, which none of the eight furniture tools documents," replacing "has," matching the disclaimer/pattern used elsewhere in the document.
- **Z4** — fixed. §05 feature-test block's "Studio moment" line now reads "the studio adding its first hands while its workload doubles," matching `docs/vision/VISION.md` §2 verbatim.
- **Z5** — fixed. P3's M6 mockup trace now reads "...and says so in words rather than by hiding the table," removing the bare "panel" so the word stays reserved for the simulated persona group.
- **Z6** — left: generic role language, not a persona attribution.

## Gate output

```
$ node source/check-math.mjs
math ok

$ grep -c '<img' proposal.html
0

$ grep -ciw 'AI' proposal.html
0

$ python3 <HTMLParser balance check>
no errors

$ grep -o 'class="[^"]*ruling[^"]*"' proposal.html | grep -c ruling
11

$ grep -oE '<td class="num">P[0-9]+</td>' proposal.html | wc -l
11

$ wc -c proposal.html
168854 proposal.html   (169 KB — within 100–250 KB)
```
