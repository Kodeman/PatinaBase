'use client';

export default function TimelineLoading() {
  return (
    <div className="timeline-loading">
      <div className="timeline-skeleton">
        <div className="skeleton-header">
          <div className="skeleton-title" />
          <div className="skeleton-description" />
        </div>
        <div className="skeleton-cards">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton-card">
              <div className="skeleton-date" />
              <div className="skeleton-content" />
            </div>
          ))}
        </div>
      </div>
      <style jsx>{`
        .timeline-loading {
          min-height: 100vh;
          background: #f5f5f5;
        }
        .timeline-skeleton {
          max-width: 800px;
          margin: 0 auto;
          padding: 80px 24px;
        }
        .skeleton-header {
          margin-bottom: 48px;
        }
        .skeleton-title {
          height: 32px;
          background: #e0e0e0;
          border-radius: 4px;
          margin-bottom: 12px;
          animation: pulse 1.5s ease-in-out infinite;
        }
        .skeleton-description {
          height: 20px;
          background: #e0e0e0;
          border-radius: 4px;
          width: 60%;
          animation: pulse 1.5s ease-in-out infinite;
        }
        .skeleton-card {
          background: white;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 24px;
        }
        .skeleton-date {
          height: 16px;
          background: #e0e0e0;
          border-radius: 4px;
          width: 120px;
          margin-bottom: 12px;
          animation: pulse 1.5s ease-in-out infinite;
        }
        .skeleton-content {
          height: 60px;
          background: #e0e0e0;
          border-radius: 4px;
          animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}