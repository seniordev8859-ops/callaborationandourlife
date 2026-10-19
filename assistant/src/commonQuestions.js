// Interview questions that come up in almost every interview. Answers to these are prepared in the
// background when listening starts, so they can be shown instantly instead of waiting for the model.
// Patterns are deliberately strict: a wrong instant answer is worse than a 2-second wait.
export const COMMON_QUESTIONS = [
  {
    id: 'about-yourself',
    question: 'Tell me about yourself.',
    // "your background/experience" only when the sentence ends there: not "your experience with GraphQL".
    pattern:
      /\b(tell|walk) (me|us) (a (little )?(bit )?)?(more )?(about|through) (yourself|your resume|your cv|your (background|experience)(?=\s*[?.!]?\s*$))|\bintroduce yourself\b/,
  },
  {
    id: 'why-company',
    question: 'Why do you want to work here?',
    pattern:
      /\bwhy (do|would) you want to (work (here|for us|with us|at)|join)\b|\bwhy (are you|you're) interested in (this|the|our) (role|position|job|company|team)\b|\bwhy did you apply\b|\bwhy (this|our) company\b/,
  },
  {
    id: 'why-hire',
    question: 'Why should we hire you?',
    pattern: /\bwhy should (we|i) hire you\b|\bwhat makes you (a good|the right|the best) (fit|candidate|person)\b/,
  },
  {
    id: 'strengths-weaknesses',
    question: 'What are your strengths and weaknesses?',
    pattern: /\bstrengths? and (your )?weakness(es)?\b/,
  },
  {
    id: 'weakness',
    question: 'What is your biggest weakness?',
    pattern: /\b(your|any) (biggest |greatest |main |key )?weakness(es)?\b|\barea(s)? (for|of) improvement\b/,
  },
  {
    id: 'strength',
    question: 'What are your greatest strengths?',
    pattern: /\b(your|any) (biggest |greatest |main |key )?strengths?\b(?!.*weakness)/,
  },
  {
    id: 'why-leaving',
    question: 'Why are you leaving your current job?',
    pattern:
      /\bwhy (are|did) you (leav|looking|look)|\bwhy (do|did) you want to leave\b|\breason (for|why you('re| are)) leaving\b/,
  },
  {
    id: 'five-years',
    question: 'Where do you see yourself in five years?',
    pattern: /\b(five|5) years\b|\bsee yourself in\b|\blong[- ]term (career )?goals\b/,
  },
  {
    id: 'conflict',
    question: 'Tell me about a time you had a conflict with a teammate.',
    pattern: /\b(conflict|disagree(d|ment)?)\b.*\b(team ?mate|colleague|co-?worker|manager|boss|team member)s?\b/,
  },
  {
    id: 'failure',
    question: 'Tell me about a time you failed or made a mistake.',
    pattern: /\ba time (when )?you (failed|made a mistake)\b|\b(biggest|worst) (failure|mistake)\b/,
  },
  {
    id: 'proud',
    question: 'What achievement are you most proud of?',
    pattern: /\b(most proud|proudest)\b|\b(biggest|greatest) (achievement|accomplishment)\b/,
  },
  {
    id: 'salary',
    question: 'What are your salary expectations?',
    pattern:
      /\bsalary (expectations?|range|requirements?)\b|\b(expected|expectations? for) (salary|compensation|pay)\b/,
  },
  {
    id: 'questions-for-us',
    question: 'Do you have any questions for us?',
    pattern:
      /\b(do|did) you have any (other |more |final )?questions\b|\banything (else )?you('d| would) like to ask\b/,
  },
];

export function matchCommonQuestion(text) {
  const t = text.toLowerCase().replace(/[’']/g, "'");
  return COMMON_QUESTIONS.find((q) => q.pattern.test(t)) || null;
}

// A natural opener the candidate can say immediately while the full answer loads.
// Buys a second or two the way people naturally do ("Yeah, good question. So…").
const OPENERS = [
  [
    /\b(tell|walk) (me|us) (a (little )?(bit )?)?(about|through) (yourself|your resume|your cv)|introduce yourself/,
    'Yeah, sure. So…',
  ],
  [/\bweakness/, "Hmm, good question. I'd say…"],
  [/\bstrength/, "I'd say probably…"],
  [
    /\btell (me|us) about a time|give (me|us) an example|describe a (time|situation)/,
    'Yeah, let me think of a good one… So,',
  ],
  [/\bwhy\b/, 'Yeah, honestly…'],
  [/\bhow would you|what would you/, "Good question. I think I'd…"],
  [/\bany questions/, "Yeah, actually, I'd love to know…"],
];

export function openerFor(question) {
  const t = question.toLowerCase();
  return OPENERS.find(([re]) => re.test(t))?.[1] || 'Yeah, good question. So…';
}
