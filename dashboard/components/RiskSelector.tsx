'use client';

interface RiskSelectorProps {
  value: 'low' | 'medium' | 'high';
  onChange: (value: 'low' | 'medium' | 'high') => void;
}

export function RiskSelector({ value, onChange }: RiskSelectorProps) {
  const options = [
    {
      value: 'low' as const,
      label: 'Low Risk',
      description: 'Stablecoin lending + liquid staking',
      color: 'from-green-500 to-emerald-600',
      borderColor: 'border-green-500/50',
    },
    {
      value: 'medium' as const,
      label: 'Medium Risk',
      description: 'BNB lending + stablecoin LPs',
      color: 'from-yellow-500 to-orange-600',
      borderColor: 'border-yellow-500/50',
    },
    {
      value: 'high' as const,
      label: 'High Risk',
      description: 'All pools + leveraged farming',
      color: 'from-red-500 to-pink-600',
      borderColor: 'border-red-500/50',
    },
  ];

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg border border-gray-700">
      <h3 className="text-lg font-semibold mb-4">Select Risk Profile</h3>
      <div className="grid md:grid-cols-3 gap-4">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`p-4 rounded-lg border-2 transition-all ${
              value === option.value
                ? `${option.borderColor} bg-gradient-to-br ${option.color} bg-opacity-10`
                : 'border-gray-700 hover:border-gray-600'
            }`}
          >
            <div className="font-semibold text-lg mb-1">{option.label}</div>
            <div className="text-sm text-gray-400">{option.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
