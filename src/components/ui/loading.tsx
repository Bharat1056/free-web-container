import { cn } from "@/lib/utils";
import { Skeleton } from "./skeleton";
import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingSpinner({
  size = "md",
  className,
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };

  return (
    <Loader2
      className={cn(
        "animate-spin text-muted-foreground",
        sizeClasses[size],
        className
      )}
    />
  );
}

interface LoadingTextProps {
  text?: string;
  className?: string;
}

export function LoadingText({
  text = "Loading...",
  className,
}: LoadingTextProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LoadingSpinner size="sm" />
      <span className="text-sm text-muted-foreground">{text}</span>
    </div>
  );
}

interface PageLoadingProps {
  title?: string;
  description?: string;
  className?: string;
}

export function PageLoading({
  title = "Loading...",
  description = "Please wait while we load your content",
  className,
}: PageLoadingProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center min-h-[400px] gap-4",
        className
      )}
    >
      <LoadingSpinner size="lg" />
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

interface CardLoadingProps {
  showAvatar?: boolean;
  showTitle?: boolean;
  showDescription?: boolean;
  lines?: number;
  className?: string;
}

export function CardLoading({
  showAvatar = true,
  showTitle = true,
  showDescription = true,
  lines = 3,
  className,
}: CardLoadingProps) {
  return (
    <div className={cn("p-4 space-y-3", className)}>
      {showAvatar && (
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      )}

      {showTitle && <Skeleton className="h-6 w-3/4" />}

      {showDescription && (
        <div className="space-y-2">
          {Array.from({ length: lines }).map((_, i) => (
            <Skeleton
              key={i}
              className={cn("h-4", i === lines - 1 ? "w-2/3" : "w-full")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ListLoadingProps {
  items?: number;
  showAvatar?: boolean;
  className?: string;
}

export function ListLoading({
  items = 5,
  showAvatar = true,
  className,
}: ListLoadingProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          {showAvatar && <Skeleton className="h-8 w-8 rounded-full" />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface MessageLoadingProps {
  showAvatar?: boolean;
  lines?: number;
  className?: string;
}

export function MessageLoading({
  showAvatar = true,
  lines = 2,
  className,
}: MessageLoadingProps) {
  return (
    <div className={cn("flex gap-3 p-4", className)}>
      {showAvatar && <Skeleton className="h-8 w-8 rounded-full shrink-0" />}
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn("h-4", i === lines - 1 ? "w-3/4" : "w-full")}
          />
        ))}
      </div>
    </div>
  );
}

interface TableLoadingProps {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
  className?: string;
}

export function TableLoading({
  rows = 5,
  columns = 4,
  showHeader = true,
  className,
}: TableLoadingProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {showHeader && (
        <div className="flex gap-2">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-8 flex-1" />
          ))}
        </div>
      )}

      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-2">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              className={cn(
                "h-10 flex-1",
                colIndex === 0 && "w-16" // First column might be narrower
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface FormLoadingProps {
  fields?: number;
  showSubmit?: boolean;
  className?: string;
}

export function FormLoading({
  fields = 4,
  showSubmit = true,
  className,
}: FormLoadingProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}

      {showSubmit && (
        <div className="flex gap-2 pt-4">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-20" />
        </div>
      )}
    </div>
  );
}

// Animated loading states
interface PulseLoadingProps {
  children: React.ReactNode;
  className?: string;
}

export function PulseLoading({ children, className }: PulseLoadingProps) {
  return <div className={cn("animate-pulse", className)}>{children}</div>;
}

interface ShimmerLoadingProps {
  className?: string;
}

export function ShimmerLoading({ className }: ShimmerLoadingProps) {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  );
}

// Add shimmer animation to globals.css if not already present
export const shimmerCSS = `
@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}
`;
