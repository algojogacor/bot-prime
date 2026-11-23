import { describe, expect, it } from 'vitest';
import { buildStarterPrompt, localStarter, shouldStartConversation } from '../../src/social/starter.js';

describe('shouldStartConversation', () => {
  it('fires only in the evening window after long silence', () => {
    expect(
      shouldStartConversation({ hourWib: 20, minutesSinceLast: 50, startersToday: 0, maxStartersPerDay: 2 }),
    ).toBe(true);
  });

  it('blocks day hours, short silence and daily cap', () => {
    expect(
      shouldStartConversation({ hourWib: 10, minutesSinceLast: 50, startersToday: 0, maxStartersPerDay: 2 }),
    ).toBe(false);
    expect(
      shouldStartConversation({ hourWib: 20, minutesSinceLast: 10, startersToday: 0, maxStartersPerDay: 2 }),
    ).toBe(false);
    expect(
      shouldStartConversation({ hourWib: 20, minutesSinceLast: 50, startersToday: 2, maxStartersPerDay: 2 }),
    ).toBe(false);
  });

  it('never starts when the chat is unknown', () => {
    expect(
      shouldStartConversation({ hourWib: 20, minutesSinceLast: null, startersToday: 0, maxStartersPerDay: 2 }),
    ).toBe(false);
  });
});

describe('starter content', () => {
  it('builds topic-grounded prompts and fallback lines', () => {
    const prompt = buildStarterPrompt(['spar', 'turnamen'], ['spar tiap jumat']);
    expect(prompt).toContain('spar');
    expect(prompt).toContain('spar tiap jumat');
    expect(localStarter(['spar'])).toContain('spar');
    expect(localStarter([])).toContain('🗿');
  });
});
