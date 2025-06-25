import React from "react";

interface SentimentFilterBarProps {
  selectedSentiment: string;
  onChange: (sentiment: string) => void;
}

const SENTIMENT_OPTIONS = [
  { label: "All", value: "ALL" },
  { label: "Urgent Issue", value: "URGENT_COMPLAINT" },
  { label: "Complaint", value: "COMPLAINT" },
  { label: "Question", value: "QUESTION" },
  { label: "Request", value: "REQUEST" },
  { label: "Thank You", value: "APPRECIATION" },
  { label: "Info/Update", value: "INFORMATIONAL" },
  { label: "Opportunity", value: "OPPORTUNITY" },
  { label: "Meeting", value: "MEETING_INVITE" },
];

const SentimentFilterBar: React.FC<SentimentFilterBarProps> = ({ selectedSentiment, onChange }) => {
  return (
    <div className="mb-4">
      <label htmlFor="sentiment-filter" className="block text-sm font-medium text-gray-700 mb-1">
        Filter by Sentiment
      </label>
      <select
        id="sentiment-filter"
        value={selectedSentiment}
        onChange={e => onChange(e.target.value)}
        className="block w-48 px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
      >
        {SENTIMENT_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default SentimentFilterBar; 