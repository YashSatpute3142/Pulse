// Conversation starters (DATABASE_SCHEMA: a static array in code, not a collection). ids are stable: never renumber.
export const SPARK_KINDS = ['question', 'challenge'];

const questions = [
  'What is a small thing that made you smile this week?',
  'If you could learn any skill overnight, what would it be?',
  'What is the best thing you have eaten recently?',
  'Which song have you had on repeat lately?',
  'What is a place you would love to visit, and why?',
  'What did you want to be when you were ten?',
  'What is one habit you are trying to build?',
  'Which book, show or game would you recommend to me?',
  'What is something you are proud of that nobody asked about?',
  'Would you rather have more time or more energy?',
  'What does your perfect lazy Sunday look like?',
  'What is the most useful thing you learned this year?',
  'Which app could you not live without?',
  'What is a tiny luxury you enjoy?',
  'If you could have dinner with anyone, who would it be?',
  'What is something new you tried recently?',
];

const challenges = [
  'Send a photo of something blue near you.',
  'Describe your day using only three emojis.',
  'Share a song and say why it fits your mood right now.',
  'Tell a two-sentence story about the last thing you ate.',
  'Compliment someone in this chat on something specific.',
  'Name five things you can see right now, in 30 seconds.',
  'Share your most-used emoji and explain it.',
  'Teach everyone one useful thing in one sentence.',
  'Post a goal for tomorrow and ask for a check-in.',
  'Rename your day: give today a movie title.',
  'Share a fun fact the others probably do not know.',
  'Draw something with emojis and let others guess it.',
];

export const SPARKS = Object.freeze([
  ...questions.map((text, i) => ({ id: `q${String(i + 1).padStart(2, '0')}`, kind: 'question', text })),
  ...challenges.map((text, i) => ({ id: `c${String(i + 1).padStart(2, '0')}`, kind: 'challenge', text })),
]);
