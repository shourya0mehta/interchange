/** Two lines meeting at an interchange capsule. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <path d="M2 9H26" stroke="#D4A017" strokeWidth="4" strokeLinecap="round" />
      <path d="M2 19H26" stroke="#1F64B5" strokeWidth="4" strokeLinecap="round" />
      <rect x="9.5" y="4.5" width="9" height="19" rx="4.5" fill="#fff" stroke="#000" strokeWidth="2" />
    </svg>
  );
}
