import { Skeleton } from "@/components/ui/skeleton";

const COLUMN_TITLES = [
  'Enquiry', 'Form Sent', 'Form Submitted', 'Payment Done', 'Exam',
  'Interview', 'Doc Verification', 'School Fee', 'Section Allocation', 'Enrolled',
];

// Mirrors AdmissionsPipeline's exact column layout (same widths, gaps, card
// shape) so the very first paint already shows the board's real structure
// instead of a blank gap — the transition to real data is a content swap
// inside the same layout, not a jarring "nothing then everything" pop-in.
function SkeletonCard() {
  return (
    <div className="rounded-3xl bg-white border border-slate-100/50 shadow-sm p-4 space-y-4">
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-2.5 w-16" />
        </div>
        <Skeleton className="h-4 w-9 rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-2.5 w-28" />
        <Skeleton className="h-2.5 w-20" />
      </div>
      <div className="pt-3 border-t border-slate-50 flex items-center justify-between">
        <Skeleton className="h-2.5 w-14" />
        <Skeleton className="h-6 w-6 rounded-lg" />
      </div>
    </div>
  );
}

export const AdmissionsPipelineSkeleton = () => (
  <div className="flex gap-6 overflow-x-auto pb-6 no-scrollbar min-h-[600px]">
    {COLUMN_TITLES.map((title, i) => (
      <div key={title} className="flex flex-col gap-4 min-w-[300px] w-[300px] h-full">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black text-slate-300 uppercase tracking-wider">{title}</h3>
            <Skeleton className="h-4 w-6 rounded-full" />
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-3 p-2 rounded-3xl bg-slate-50/50 min-h-[500px]">
          {/* First couple of columns look "busier" than the tail ones, closer
              to how a real pipeline is actually distributed, so the skeleton
              doesn't read as artificially uniform. */}
          {Array.from({ length: i < 3 ? 2 : 1 }).map((_, j) => (
            <SkeletonCard key={j} />
          ))}
        </div>
      </div>
    ))}
  </div>
);
