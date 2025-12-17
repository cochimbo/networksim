interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  count?: number;
}

export function Skeleton({
  className = '',
  variant = 'text',
  width,
  height,
  count = 1,
}: SkeletonProps) {
  const baseClass = 'animate-pulse bg-gray-200 dark:bg-gray-700';

  const variantClass = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  }[variant];

  const style: React.CSSProperties = {
    width: width ?? (variant === 'circular' ? height : '100%'),
    height: height ?? (variant === 'text' ? '1em' : variant === 'circular' ? width : 'auto'),
  };

  const elements = Array.from({ length: count }, (_, i) => (
    <div
      key={i}
      className={`${baseClass} ${variantClass} ${className}`}
      style={style}
    />
  ));

  return count === 1 ? elements[0] : <>{elements}</>;
}

// Common skeleton patterns
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton variant="circular" width={32} height={32} />
          <div className="flex-1 space-y-2">
            <Skeleton height={14} width="60%" />
            <Skeleton height={10} width="40%" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="flex-1">
          <Skeleton height={16} width="50%" className="mb-2" />
          <Skeleton height={12} width="30%" />
        </div>
      </div>
      <Skeleton height={12} width="80%" />
      <Skeleton height={12} width="60%" />
    </div>
  );
}

export function SkeletonChart({ height = 100 }: { height?: number }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex justify-between items-center mb-4">
        <Skeleton height={14} width={100} />
        <Skeleton height={14} width={60} />
      </div>
      <Skeleton variant="rectangular" height={height} className="w-full" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex gap-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-t-lg">
        <Skeleton height={12} width="20%" />
        <Skeleton height={12} width="30%" />
        <Skeleton height={12} width="20%" />
        <Skeleton height={12} width="15%" />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-4 p-3 border-b border-gray-100 dark:border-gray-700">
          <Skeleton height={12} width="20%" />
          <Skeleton height={12} width="30%" />
          <Skeleton height={12} width="20%" />
          <Skeleton height={12} width="15%" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonStats() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Skeleton variant="circular" width={16} height={16} />
            <Skeleton height={10} width={60} />
          </div>
          <Skeleton height={24} width={80} />
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
