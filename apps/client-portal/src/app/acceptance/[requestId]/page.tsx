import { ServiceAcceptancePage } from '@/components/service-acceptance/service-acceptance';

export default async function AcceptancePage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  return <ServiceAcceptancePage requestId={requestId} />;
}
