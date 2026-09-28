export const LogoAeroTrend = ({ className = "w-8 h-8" }: { className?: string }) => (
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <linearGradient id="aero-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
        <stop stopColor="#3B82F6" /> {/* blue-500 */}
        <stop offset="1" stopColor="#06B6D4" /> {/* cyan-500 */}
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="8" fill="url(#aero-grad)" />
    {/* First F / Upward Trend */}
    <path d="M9 8h10l-3 4H13v3h5l-3 4h-2v5H9V8z" fill="white" />
    {/* Second F / Trailing Wing */}
    <path d="M16 8h7l-3 4h-4V8zM16 15h4l-3 4h-1v-4z" fill="white" fillOpacity="0.6" />
  </svg>
);
