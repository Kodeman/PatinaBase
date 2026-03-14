'use client';

import { cn } from '@/lib/utils';

interface FormFieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({ label, children, className }: FormFieldProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <label className="block text-[11px] font-medium text-patina-clay-beige uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}

export function TextInput({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 text-sm border border-patina-clay-beige/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 bg-white"
    />
  );
}

export function TextArea({ value, onChange, rows = 3, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full px-3 py-2 text-sm border border-patina-clay-beige/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 resize-none bg-white"
    />
  );
}

export function SelectInput({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 text-sm border border-patina-clay-beige/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 bg-white"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
