import React from "react";

interface PriorityFilterBarProps {
  selectedPriorities: number[];
  onChange: (priorities: number[]) => void;
}

const PRIORITY_OPTIONS = [
  {
    label: "All",
    levels: [1, 2, 3, 4, 5],
  },
  {
    label: "High",
    levels: [1, 2],
  },
  {
    label: "Medium",
    levels: [3],
  },
  {
    label: "Low",
    levels: [4, 5],
  },
];

const PriorityFilterBar: React.FC<PriorityFilterBarProps> = ({ selectedPriorities, onChange }) => {
  // Determine which option is currently selected
  const selectedOption = PRIORITY_OPTIONS.find(option => {
    return (
      option.levels.length === selectedPriorities.length &&
      option.levels.every(lvl => selectedPriorities.includes(lvl))
    );
  }) || PRIORITY_OPTIONS[0];

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = PRIORITY_OPTIONS.find(option => option.label === e.target.value);
    if (selected) {
      onChange(selected.levels);
    }
  };

  return (
    <div className="mb-4">
      <label htmlFor="priority-filter" className="block text-sm font-medium text-gray-700 mb-1">
        Filter by Priority
      </label>
      <select
        id="priority-filter"
        value={selectedOption.label}
        onChange={handleChange}
        className="block w-48 px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
      >
        {PRIORITY_OPTIONS.map(option => (
          <option key={option.label} value={option.label}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default PriorityFilterBar; 