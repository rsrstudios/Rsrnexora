import React from "react";

interface RSRLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showText?: boolean;
}

export const RSRLogo: React.FC<RSRLogoProps> = ({
  size = "md",
  className = "",
  showText = false,
}) => {
  const sizeMap = {
    sm: "w-6 h-6 text-xs",
    md: "w-8 h-8 text-sm",
    lg: "w-12 h-12 text-base",
    xl: "w-16 h-16 text-xl",
  };

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* Geometric RSR Insignia: Clean, precision geometric monogram */}
      <div
        className={`${sizeMap[size]} rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 flex items-center justify-center font-bold tracking-tight shadow-sm relative overflow-hidden transition-transform duration-200 hover:scale-105 select-none`}
      >
        <span className="font-extrabold tracking-tighter">RSR</span>
      </div>

      {showText && (
        <div className="flex flex-col leading-none">
          <span className="font-bold text-sm tracking-tight text-neutral-900 dark:text-neutral-100">
            RSR Nexora
          </span>
          <span className="text-[10px] tracking-wider text-neutral-600 dark:text-neutral-400 font-mono mt-0.5">
            RSR STUDIOS
          </span>
        </div>
      )}
    </div>
  );
};
