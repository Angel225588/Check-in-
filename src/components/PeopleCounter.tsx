"use client";

interface PeopleCounterProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

export default function PeopleCounter({
  value,
  min,
  max,
  onChange,
}: PeopleCounterProps) {
  return (
    <div className="flex items-center justify-center gap-6">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-16 h-16 rounded-full glass text-3xl font-bold flex items-center justify-center disabled:opacity-30 active:scale-90 transition-all"
      >
        -
      </button>
      <div className="text-6xl font-bold w-24 text-center text-dark">{value}</div>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-16 h-16 rounded-full glass text-3xl font-bold flex items-center justify-center disabled:opacity-30 active:scale-90 transition-all"
      >
        +
      </button>
    </div>
  );
}
