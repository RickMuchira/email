import React from "react";

interface PriorityBadgeProps {
  priority_level: number;
  priority_name: string;
  className?: string;
}

const getPriorityConfig = (level: number) => {
  switch (level) {
    case 1:
      return {
        color: "bg-red-100 text-red-800 border-red-200",
        icon: "🚨",
        pulse: true,
      };
    case 2:
      return {
        color: "bg-orange-100 text-orange-800 border-orange-200",
        icon: "⚡",
        pulse: false,
      };
    case 3:
      return {
        color: "bg-blue-100 text-blue-800 border-blue-200",
        icon: "📋",
        pulse: false,
      };
    case 4:
      return {
        color: "bg-green-100 text-green-800 border-green-200",
        icon: "📝",
        pulse: false,
      };
    case 5:
    default:
      return {
        color: "bg-gray-100 text-gray-800 border-gray-200",
        icon: "📄",
        pulse: false,
      };
  }
};

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({
  priority_level,
  priority_name,
  className = "",
}) => {
  const config = getPriorityConfig(priority_level);
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.color} ${className} ${
        config.pulse ? "animate-pulse" : ""
      }`}
    >
      <span className="mr-1">{config.icon}</span>
      {priority_name}
    </span>
  );
};

export default PriorityBadge; 