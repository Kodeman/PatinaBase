import { CommsSubnav } from '@/components/communications/comms-subnav';

interface CommunicationsLayoutProps {
  children: React.ReactNode;
}

export default function CommunicationsLayout({ children }: CommunicationsLayoutProps) {
  return (
    <div className="bg-patina-off-white min-h-screen">
      <CommsSubnav />
      {children}
    </div>
  );
}
