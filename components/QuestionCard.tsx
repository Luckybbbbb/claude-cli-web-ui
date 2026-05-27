'use client';

import { useState } from 'react';

interface QuestionOption {
  label: string;
  description?: string;
  preview?: string;
}

interface Question {
  question: string;
  header?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
}

interface QuestionCardProps {
  toolUseId: string;
  questions: Question[];
  result?: string;
  isError?: boolean;
  onSelect: (toolUseId: string, answer: string) => void;
}

export function QuestionCard({ toolUseId, questions, result, isError, onSelect }: QuestionCardProps) {
  const [selectedMap, setSelectedMap] = useState<Record<number, string[]>>({});
  const [submitted, setSubmitted] = useState(false);

  const handleSelect = (qIndex: number, option: QuestionOption) => {
    if (submitted) return;

    const q = questions[qIndex];
    setSelectedMap((prev) => {
      const current = prev[qIndex] || [];
      if (q.multiSelect) {
        const next = current.includes(option.label)
          ? current.filter((l) => l !== option.label)
          : [...current, option.label];
        return { ...prev, [qIndex]: next };
      }
      return { ...prev, [qIndex]: [option.label] };
    });
  };

  const handleSubmit = () => {
    if (submitted) return;
    const answers: string[] = [];
    for (let i = 0; i < questions.length; i++) {
      const sel = selectedMap[i];
      if (!sel || sel.length === 0) return;
      answers.push(sel.join(', '));
    }
    setSubmitted(true);
    onSelect(toolUseId, answers.join('\n'));
  };

  const allAnswered = questions.every((_, i) => {
    const sel = selectedMap[i];
    return sel && sel.length > 0;
  });

  return (
    <div
      className="my-2 overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        borderLeft: '3px solid #6366f1',
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-2.5 flex items-center"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <svg
          className="w-4 h-4 mr-2 flex-shrink-0"
          fill="none"
          stroke="#6366f1"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
          <path strokeLinecap="round" strokeWidth={2} d="M12 16v-1m0-7a2.5 2.5 0 015 0" />
        </svg>
        <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
          {questions.length === 1 && questions[0].header
            ? questions[0].header
            : `${questions.length} 个问题`}
        </span>
        {submitted && (
          <span
            className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: '#f0fdf4', color: '#16a34a' }}
          >
            已回答
          </span>
        )}
      </div>

      {/* Questions */}
      <div className="px-4 py-3 space-y-4">
        {questions.map((q, qIndex) => (
          <div key={qIndex}>
            {questions.length > 1 && q.header && (
              <div
                className="text-xs font-semibold uppercase mb-1 tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                {q.header}
              </div>
            )}
            <p
              className="text-sm font-medium mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              {q.question}
            </p>

            {/* Options */}
            <div className="space-y-2">
              {q.options.map((option, oIndex) => {
                const selected = (selectedMap[qIndex] || []).includes(option.label);
                return (
                  <button
                    key={oIndex}
                    onClick={() => handleSelect(qIndex, option)}
                    disabled={submitted}
                    className="w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150"
                    style={{
                      backgroundColor: submitted
                        ? selected
                          ? 'rgba(99, 102, 241, 0.1)'
                          : 'var(--bg-secondary)'
                        : selected
                          ? 'rgba(99, 102, 241, 0.1)'
                          : 'var(--bg-secondary)',
                      border: `1px solid ${submitted ? (selected ? '#6366f1' : 'var(--border)') : selected ? '#6366f1' : 'var(--border)'}`,
                      cursor: submitted ? 'default' : 'pointer',
                      opacity: submitted && !selected ? 0.5 : 1,
                    }}
                  >
                    <div className="flex items-start">
                      {/* Radio/Checkbox indicator */}
                      <span
                        className="flex-shrink-0 mt-0.5 mr-2"
                        style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: q.multiSelect ? '3px' : '50%',
                          border: `1.5px solid ${selected ? '#6366f1' : 'var(--text-secondary)'}`,
                          backgroundColor: selected ? '#6366f1' : 'transparent',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}
                      >
                        {selected && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}>
                            {q.multiSelect ? (
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            ) : (
                              <circle cx="12" cy="12" r="6" fill="white" />
                            )}
                          </svg>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span
                          className="text-sm font-medium"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {option.label}
                        </span>
                        {option.description && (
                          <span
                            className="block text-xs mt-0.5"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {option.description}
                          </span>
                        )}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Submit button */}
        {!submitted && (
          <button
            onClick={handleSubmit}
            disabled={!allAnswered}
            className="mt-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150"
            style={{
              backgroundColor: allAnswered ? '#6366f1' : 'var(--bg-secondary)',
              color: allAnswered ? 'white' : 'var(--text-secondary)',
              border: `1px solid ${allAnswered ? '#6366f1' : 'var(--border)'}`,
              cursor: allAnswered ? 'pointer' : 'not-allowed',
              opacity: allAnswered ? 1 : 0.6,
            }}
          >
            确认选择
          </button>
        )}
      </div>

      {/* Error result (subtle) */}
      {result && isError && !submitted && (
        <div
          className="px-4 py-2 text-xs"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            borderTop: '1px solid var(--border)',
          }}
        >
          提示：此问题需要交互式回答，选择选项后将自动发送
        </div>
      )}
    </div>
  );
}
