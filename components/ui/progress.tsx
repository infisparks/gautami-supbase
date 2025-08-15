'use client';

import * as React from 'react';
import { cn } from '@/lib/utils'; // Assuming cn utility (from clsx) is still available and useful

// Define the props for the custom Progress component
interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number; // The current progress value (0-100)
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, ...props }, ref) => {
    // Ensure value is within 0-100 range
    const clampedValue = Math.max(0, Math.min(100, value || 0));

    return (
      <div
        ref={ref}
        className={cn(
          'relative h-4 w-full overflow-hidden rounded-full bg-gray-200', // Base styling for the progress bar track
          className // Allows custom classes to be passed in
        )}
        {...props}
      >
        <div
          className="h-full flex-1 rounded-full bg-blue-600 transition-all duration-500 ease-in-out" // Styling for the progress indicator
          style={{ transform: `translateX(-${100 - clampedValue}%)` }} // Moves the indicator based on value
        />
      </div>
    );
  }
);

Progress.displayName = 'Progress';

export { Progress };
