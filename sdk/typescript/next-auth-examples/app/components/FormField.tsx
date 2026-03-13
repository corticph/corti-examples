"use client";

type FormFieldProps = {
  id: string;
  label: string;
  type: "text" | "password";
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
};

export function FormField({ id, label, type, value, onChange, placeholder }: FormFieldProps) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="w-32 text-sm font-medium text-gray-700 shrink-0">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        placeholder={placeholder}
      />
    </div>
  );
}
