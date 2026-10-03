// The company systems Hermes reads, in the order the first screen's orbit and the Connections view show them: each with a
// small line icon and a question that Hermes answers by reading that system. Names match the `system` the tools carry.

import type { ReactNode } from 'react';

export type HermesSystemName = 'Directory' | 'Clockify' | 'Jira' | 'GitHub' | 'Teams' | 'AWS';

export interface HermesSystem {
  name: HermesSystemName;
  icon: ReactNode;
  /** what selecting the system on the orbit asks */
  ask: string;
}

const Glyph = ({ children }: { children: ReactNode }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true" focusable="false">
    {children}
  </svg>
);

export const HERMES_SYSTEMS: HermesSystem[] = [
  {
    name: 'Directory',
    ask: 'How is the team doing?',
    icon: (
      <Glyph>
        <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
        <circle cx="12" cy="10" r="2.6" />
        <path d="M7.8 16.5c.7-1.9 2.3-3 4.2-3s3.5 1.1 4.2 3" />
      </Glyph>
    ),
  },
  {
    name: 'Clockify',
    ask: 'How many hours did I work this week?',
    icon: (
      <Glyph>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </Glyph>
    ),
  },
  {
    name: 'Jira',
    ask: 'What are my open tickets?',
    icon: (
      <Glyph>
        <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4Z" />
        <path d="M9 10h6M9 14h4" />
      </Glyph>
    ),
  },
  {
    name: 'GitHub',
    ask: 'How are the projects going?',
    icon: (
      <Glyph>
        <circle cx="7" cy="5.5" r="2" />
        <circle cx="7" cy="18.5" r="2" />
        <circle cx="17" cy="8.5" r="2" />
        <path d="M7 7.5v9M17 10.5c0 4-4 3.5-8.6 6.6" />
      </Glyph>
    ),
  },
  {
    name: 'Teams',
    ask: "What did we decide in yesterday's standup?",
    icon: (
      <Glyph>
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5v4a2.5 2.5 0 0 1-2.5 2.5H9l-3.5 3v-3A2.5 2.5 0 0 1 4 10.5Z" />
        <path d="M19 9.5a2 2 0 0 1 1 1.7v3.6a2 2 0 0 1-2 2h-.5V19l-3-2.2h-2.2" />
      </Glyph>
    ),
  },
  {
    name: 'AWS',
    ask: 'Why did AWS costs go up?',
    icon: (
      <Glyph>
        <path d="M7 18.5a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 9.2a4.5 4.5 0 0 1 .5 9.3Z" />
      </Glyph>
    ),
  },
];
