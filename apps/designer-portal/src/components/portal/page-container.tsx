interface PageContainerProps {
  children: React.ReactNode;
  narrow?: boolean;
}

export function PageContainer({ children, narrow }: PageContainerProps) {
  return (
    <div
      className={`mx-auto w-[90vw] px-4 md:px-0 ${narrow ? 'max-w-portal-narrow' : 'max-w-portal'}`}
    >
      {children}
    </div>
  );
}
