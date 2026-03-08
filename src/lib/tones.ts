export interface TonePreset {
  key: string;
  label: string;
  description: string;
}

export const TONE_PRESETS: TonePreset[] = [
  {
    key: "informative",
    label: "Informative",
    description:
      "The writer obtains information through extensive research and experience, and they don't include personal opinions. The tone is neutral, and the language is clear and concise. The writer uses facts, statistics, and examples to support their points.",
  },
  {
    key: "short_with_emoji",
    label: "Short with Emoji",
    description:
      "The writer obtains information through extensive research and experience, and they don't include personal opinions. The tone is neutral, and the language is clear and concise. The writer uses facts, statistics, and examples to support their points. Conciseness (Shorticle Format): Keep the entire article exceptionally short. Keep all sentences short, direct, and straight to the point. Prioritize clarity and conciseness above all else. Formatting and Scannability: add emoji at the beginning of (H1, H2, H3) and bullet list points. Use frequent bulleted lists to simplify and break up the text. Remove any title case. Use standard sentence case or lowercase only.",
  },
  {
    key: "formal",
    label: "Formal",
    description:
      "The writer uses a professional tone, formal language, and avoids contractions. The tone is respectful, and the language is precise. The writer is completely thorough and direct, emphasizing facts and figures. An article with a formal tone usually has longer sentences, extremely proper grammar, complex word choice, and no slang. The writer uses technical terms and jargon relevant to the subject matter.",
  },
  {
    key: "persuasive",
    label: "Persuasive",
    description:
      "The writer uses emotional appeals, persuasive language, and rhetorical devices to convince the reader to take a specific action or adopt a particular viewpoint. The tone is assertive, and the language is compelling. The writer uses anecdotes, testimonials, and persuasive arguments to support their points.",
  },
  {
    key: "humorous",
    label: "Humorous",
    description:
      "The writer uses humor, wit, and playful language to entertain the reader. The tone is light-hearted, and the language is engaging. The writer uses jokes, anecdotes, and humorous observations to make the reader laugh.",
  },
  {
    key: "inspirational",
    label: "Inspirational",
    description:
      "The writer uses motivational language, uplifting messages, and positive affirmations to inspire the reader. The tone is encouraging, and the language is empowering. The writer uses personal stories, quotes, and inspirational examples to uplift the reader's spirit.",
  },
  {
    key: "friendly",
    label: "Friendly",
    description:
      "The writer uses a conversational tone, informal language, and personal anecdotes to create a friendly and approachable atmosphere. The tone is warm, and the language is relatable. The writer uses humor, storytelling, and personal experiences to connect with the reader on a personal level.",
  },
];
