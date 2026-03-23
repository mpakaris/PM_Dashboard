interface BadgeProps {
  label: string;
  color?: 'blue' | 'orange' | 'green' | 'red' | 'yellow' | 'gray';
}

const colorClasses: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-700',
  orange: 'bg-orange-100 text-orange-700',
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  gray: 'bg-gray-100 text-gray-700',
};

export default function Badge({ label, color = 'gray' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClasses[color]}`}>
      {label}
    </span>
  );
}
