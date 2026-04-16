interface ScoreCircleProps {
  score: number;
  label?: string;
  size?: 'sm' | 'default' | 'lg';
}

const sizeStyles = {
  sm: { wrapper: 'h-[52px] w-[52px] border-2', num: 'text-[1.1rem]', label: 'text-[0.42rem]' },
  default: { wrapper: 'h-[90px] w-[90px] border-[3px]', num: 'text-[1.5rem]', label: 'text-[0.55rem]' },
  lg: { wrapper: 'h-[100px] w-[100px] border-[3px]', num: 'text-[1.7rem]', label: '' },
};

export function ScoreCircle({ score, label = 'Match', size = 'default' }: ScoreCircleProps) {
  const s = sizeStyles[size];
  const displayScore = Math.round(score <= 1 ? score * 100 : score);
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-full border-patina-clay ${s.wrapper}`}
    >
      <span className={`type-data-large ${s.num}`}>
        {displayScore}
        <span className="type-data-unit">%</span>
      </span>
      <span className={`type-meta-small ${s.label}`}>{label}</span>
    </div>
  );
}
