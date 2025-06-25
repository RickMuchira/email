import React from "react";

interface SentimentBadgeProps {
  sentiment?: string;
  sentiment_display?: string;
  confidence?: number;
  className?: string;
}

const getSentimentConfig = (sentimentType?: string) => {
  switch (sentimentType) {
    case "URGENT_COMPLAINT":
      return "bg-red-100 text-red-800 border-red-200";
    case "COMPLAINT":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "QUESTION":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "REQUEST":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "APPRECIATION":
      return "bg-green-100 text-green-800 border-green-200";
    case "INFORMATIONAL":
      return "bg-gray-100 text-gray-800 border-gray-200";
    case "OPPORTUNITY":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "MEETING_INVITE":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

export const SentimentBadge: React.FC<SentimentBadgeProps> = ({
  sentiment,
  sentiment_display,
  confidence,
  className = "",
}) => {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getSentimentConfig(
        sentiment
      )} ${className}`}
      title={confidence ? `Confidence: ${confidence}%` : undefined}
    >
      {sentiment_display || sentiment}
      {confidence && confidence < 70 && (
        <span className="ml-1 text-xs opacity-70">?</span>
      )}
    </span>
  );
};

export default SentimentBadge; 