import React from 'react';

/**
 * FlowCap Logo — HashFox brand mark
 */
export function FlowCapLogo({
  size = 32,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/logo.jpg"
      alt="CustoFi"
      width={size}
      height={size}
      className={`rounded-lg object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * FlowCap wordmark — Logo + "FlowCap" text
 */
export function FlowCapWordmark({
  size = 32,
  className = '',
  showSubtitle = false,
}: {
  size?: number;
  className?: string;
  showSubtitle?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <FlowCapLogo size={size} />
      <div className="flex flex-col">
        <span
          className="font-bold text-white tracking-tight leading-none"
          style={{ fontSize: size * 0.55 }}
        >
          CustoFi
        </span>
        {showSubtitle && (
          <span className="text-[10px] text-zinc-500 tracking-wider uppercase mt-0.5">
            DeFi Yield Agent
          </span>
        )}
      </div>
    </div>
  );
}
