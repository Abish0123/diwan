import React from 'react';
import { motion } from 'motion/react';
import { LucideIcon, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AIModuleCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  onClick: () => void;
  className?: string;
}

export const AIModuleCard: React.FC<AIModuleCardProps> = ({
  title,
  description,
  icon: Icon,
  onClick,
  className,
}) => {
  return (
    <motion.div
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "group relative bg-white p-6 rounded-[24px] border border-slate-200/60 shadow-sm cursor-pointer transition-all duration-300",
        "hover:shadow-xl hover:shadow-purple-500/10 hover:border-purple-200",
        className
      )}
    >
      <div className="flex flex-col h-full">
        <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center mb-4 group-hover:bg-purple-100 transition-colors">
          <Icon className="w-6 h-6 text-purple-600" />
        </div>
        
        <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
        <p className="text-sm text-slate-500 mb-6 flex-grow">{description}</p>
        
        <div className="flex items-center text-purple-600 font-medium text-sm group-hover:translate-x-1 transition-transform">
          Open module
          <ArrowRight className="ml-2 w-4 h-4" />
        </div>
      </div>
      
      {/* Subtle glow effect on hover */}
      <div className="absolute inset-0 rounded-[24px] bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </motion.div>
  );
};
