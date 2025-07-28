import React from 'react';
import { Caption } from '../types';

interface TranscriptPanelProps {
  captions: Caption[];
  onCaptionChange: (id: number, text: string) => void;
}

const TranscriptPanel: React.FC<TranscriptPanelProps> = ({ captions, onCaptionChange }) => {
  return (
    <div className="flex flex-col flex-grow min-h-0">
      <h3 className="text-lg font-semibold mb-3 text-white flex-shrink-0">Transcript</h3>
      <div className="space-y-2 flex-grow overflow-y-auto pr-2 -mr-2">
        {captions.map((caption) => (
          <div key={caption.id} className="text-sm">
            <input
              type="text"
              value={caption.text}
              onChange={(e) => onCaptionChange(caption.id, e.target.value)}
              className="w-full bg-slate-900/70 p-3 rounded-lg text-slate-200 border border-slate-700/50 focus:border-purple-500 focus:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all duration-200"
              aria-label={`Caption text for time ${caption.start} to ${caption.end}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default TranscriptPanel;