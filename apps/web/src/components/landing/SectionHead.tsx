// Shared section header (kicker + h2) used by every landing section.

export function SectionHead({ kicker, title }: { kicker?: string; title: string }) {
  return (
    <div className="sec-head">
      {kicker && <span className="sec-kicker">{kicker}</span>}
      <h2>{title}</h2>
    </div>
  );
}
