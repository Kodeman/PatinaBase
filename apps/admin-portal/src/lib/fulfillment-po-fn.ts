// Server-side helper: invoke the fulfillment-po edge function with a
// service-role Bearer (S3, spec §5.3). The composer routes hold the service
// key; the browser never calls the function directly. fulfillment-po runs
// verify_jwt=false + requires role==service_role in-code, so the service key
// is both the apikey (Kong) and the Bearer (the function's role check).

export interface FulfillmentPoFnBody {
  po_id: string;
  mode: 'preview' | 'send' | 'mark_transmitted';
  method?: string;
  reference?: string;
  actor?: string;
}

function fnUrl(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  return `${base.replace(/\/$/, '')}/functions/v1/fulfillment-po`;
}

/** Raw fetch Response — preview streams the PDF body; send/mark parse JSON. */
export async function invokeFulfillmentPo(body: FulfillmentPoFnBody): Promise<Response> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return fetch(fnUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
