interface ScoreCircleProps {
  score: number;
  label?: string;
  size?: 'sm' | 'default' | 'lg';
}

const sizeStyles = {
  sm: { wrapper: 'h-[52px] w-[52px] border-2', num: 'text-[1.2rem]', label: 'text-[0.42rem]' },
  default: { wrapper: 'h-[90px] w-[90px] border-[3px]', num: '', label: '' },
  lg: { wrapper: 'h-[100px] w-[100px] border-[3px]', num: 'text-[2.2rem]', label: '' },
};

export function ScoreCircle({ score, label = 'Match', size = 'default' }: ScoreCircleProps) {
  const s = sizeStyles[size];
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-full border-patina-clay ${s.wrapper}`}
    >
      <span className={`type-data-large ${s.num}`}>{score}</span>
      <span className={`type-meta-small ${s.label}`}>{label}</span>
    </div>
  );
}
