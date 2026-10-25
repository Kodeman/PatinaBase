import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { test, expect } from '../fixtures/auth';
import { adminDb } from '../helpers/supabase-admin';
import { psqlAsUserRow, psqlScalar } from '../helpers/psql';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const DESIGNER = 'f0180000-0000-4000-8000-000000000002';
const rpc = (sql: string) =>
  JSON.parse(psqlAsUserRow(DESIGNER, `SELECT ${sql}::text;`)[0]);

test('issued evidence stays frozen as current advances; private viewer retries and returns to its opener', async ({
  authenticatedPage: page,
}, info) => {
  test.setTimeout(240_000);
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname).toBe(
    '127.0.0.1',
  );
  expect(
    psqlScalar(
      `SELECT count(*) FROM projects WHERE id='${JOB}' AND designer_id='${DESIGNER}'`,
    ),
  ).toBe('1');
  const prefix = `${JOB}/plans/sq1978-${info.project.name}-${Date.now()}`;
  const bytes = readFileSync(
    path.resolve(__dirname, '../fixtures/whitlock-set.pdf'),
  );
  const newerBytes = Buffer.concat([
    bytes,
    Buffer.from('\n% fictional later print\n'),
  ]);
  const paths = [`${prefix}-a.pdf`, `${prefix}-b.pdf`];
  try {
    for (const [index, body] of [bytes, newerBytes].entries()) {
      const { error } = await adminDb.storage
        .from('project-documents')
        .upload(paths[index], body, { contentType: 'application/pdf' });
      if (error) throw error;
    }
    const printInput = (index: number, body: Buffer) => ({
      storage_path: paths[index],
      sha256: createHash('sha256').update(body).digest('hex'),
      size_bytes: body.length,
    });
    const file = (key: string, item: object) =>
      rpc(
        `public.file_plan_prints('${JOB}', '${prefix}-${key}', '${JSON.stringify([item])}'::jsonb)`,
      );
    const filed = file('a', {
      kind: 'new_sheet',
      sheet: {
        number: `D02-${info.project.name}`,
        title: 'Fictional evidence plan',
      },
      print: printInput(0, bytes),
    });
    const { sheetId, printId } = filed.prints[0];
    const issue = rpc(
      `public.create_plan_issue('${JOB}', 'D02 frozen ${info.project.name}', '${prefix}-issue')`,
    ).issue;
    rpc(
      `public.create_plan_transmittal('${issue.id}', 'information', NULL, 'Fictional D02 recipient', NULL, 'Local evidence fixture only')`,
    );
    const frozenRead = () =>
      psqlScalar(
        `SELECT jsonb_build_object('issue', to_jsonb(i), 'prints', (SELECT jsonb_agg(p ORDER BY p.id) FROM plan_issue_prints p WHERE p.issue_id=i.id), 'transmittals', (SELECT jsonb_agg(t ORDER BY t.id) FROM plan_transmittals t WHERE t.issue_id=i.id), 'documents', (SELECT jsonb_agg(d ORDER BY d.id) FROM project_documents d JOIN plan_prints pp ON pp.project_document_id=d.id WHERE pp.id='${printId}'))::text FROM plan_issues i WHERE i.id='${issue.id}'`,
      );
    const frozen = frozenRead();
    const heldEdition = () => {
      const holdings = rpc(`public.get_plan_room_holdings('${JOB}')`);
      const recipient = holdings.parties.find(
        (party: { issueId: string }) => party.issueId === issue.id,
      );
      expect(recipient, 'native holdings contain the sent issue').toBeTruthy();
      return {
        issueId: recipient.issueId,
        holds: recipient.holds.map(
          (hold: { sheetId: string; heldRev: string }) => ({
            sheetId: hold.sheetId,
            heldRev: hold.heldRev,
          }),
        ),
      };
    };
    const heldBefore = heldEdition();
    file('b', {
      kind: 'revision',
      sheet_id: sheetId,
      print: printInput(1, newerBytes),
    });
    expect(
      heldEdition(),
      'native recipient still holds the frozen edition',
    ).toEqual(heldBefore);
    expect(
      frozenRead(),
      'frozen IDs, hash, content metadata and transmittal holdings unchanged',
    ).toBe(frozen);
    const { data, error } = await adminDb.storage
      .from('project-documents')
      .download(paths[0]);
    if (error) throw error;
    expect(
      Buffer.from(await data!.arrayBuffer()).equals(bytes),
      'issued private PDF bytes unchanged',
    ).toBe(true);
    expect(
      psqlScalar(
        `SELECT current_print_id <> '${printId}'::uuid FROM plan_sheets WHERE id='${sheetId}'`,
      ),
    ).toBe('t');

    const signedRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/storage/v1/object/sign/project-documents/'))
        signedRequests.push(request.url());
    });
    await page.goto(`/doc/${JOB}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    await expect(page.locator('[data-arrival-ready]')).toHaveCount(1, {
      timeout: 60_000,
    });
    await expect(page.locator('html')).not.toHaveClass(
      /\barr-(?:pre|on|press)\b/,
    );
    const history = page.getByRole('region', { name: 'Issued print history' });
    await expect(history).toBeVisible();
    const issueEntry = history
      .locator('details')
      .filter({ hasText: `D02 frozen ${info.project.name}` });
    await issueEntry.locator('summary').click();
    const print = issueEntry.locator(`[data-issued-print-id="${printId}"]`);
    await expect(print).toContainText('not current / superseded');
    await expect(print).toContainText(printInput(0, bytes).sha256);
    await expect(issueEntry).toContainText('receipt not confirmed');
    expect(
      signedRequests.filter(
        (url) =>
          url.includes(encodeURIComponent(paths[0])) || url.includes(paths[0]),
      ),
    ).toHaveLength(0);
    const opener = print.getByRole('button', { name: 'Open issued print' });
    await page.route('**/rest/v1/project_documents*', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"message":"D02 forced read failure"}',
      }),
    );
    await opener.click();
    const viewer = page.getByRole('dialog');
    await expect(
      viewer.getByText(/This print could not be opened/),
    ).toBeVisible();
    await page.unroute('**/rest/v1/project_documents*');
    await viewer.getByRole('button', { name: 'Retry opening print' }).click();
    await expect(viewer.locator('iframe')).toHaveAttribute(
      'src',
      /storage\/v1\/object\/sign\/project-documents/,
    );
    await expect(viewer).toContainText('SUPERSEDED');
    await page.screenshot({
      path: info.outputPath('issued-private-viewer.png'),
    });
    await viewer.getByRole('button', { name: 'Back to the document', exact: true }).click();
    await expect(viewer).toHaveCount(0);
    await expect(opener).toBeFocused();

    await opener.click();
    await expect(viewer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(frozenRead()).toBe(frozen);
    console.log(
      '[D02 readback] frozen IDs/hash/metadata/recipient transmittals and private PDF bytes unchanged; current advanced',
    );
  } finally {
    const { error } = await adminDb.storage
      .from('project-documents')
      .remove(paths);
    if (error) throw error;
  }
});
