const NUMBERS = [
  "twelve", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty"];

export function numberWord(value: number): string {
  if (value < 20) return NUMBERS[value]!;
  const ones = value % 10;
  return ones ? `${TENS[Math.floor(value / 10)]}-${NUMBERS[ones]}` : TENS[Math.floor(value / 10)]!;
}

function hourWord(hour24: number): string {
  return NUMBERS[hour24 % 12 || 12]!;
}

function minutePhrase(minutes: number): string {
  if (minutes === 15) return "a quarter";
  if (minutes === 30) return "half";
  if (minutes % 5 === 0) return numberWord(minutes);
  return `${numberWord(minutes)} ${minutes === 1 ? "minute" : "minutes"}`;
}

/** The time as a sentence a person would say: "It is ten past four." */
export function timeSentence(hour24: number, minute: number): string {
  if (minute === 0) {
    if (hour24 === 0) return "It is midnight.";
    if (hour24 === 12) return "It is noon.";
    return `It is ${hourWord(hour24)} o’clock.`;
  }
  if (minute <= 30) return `It is ${minutePhrase(minute)} past ${namedHour(hour24)}.`;
  return `It is ${minutePhrase(60 - minute)} to ${namedHour((hour24 + 1) % 24)}.`;
}

function namedHour(hour24: number): string {
  if (hour24 === 0) return "midnight";
  if (hour24 === 12) return "noon";
  return hourWord(hour24);
}

/** Which part of the day the sentence falls in, said after it. */
export function dayPart(hour24: number, minute: number): string {
  if (minute === 0 && (hour24 === 0 || hour24 === 12)) return "";
  const hour = minute > 30 ? (hour24 + 1) % 24 : hour24;
  if (hour >= 5 && hour < 12) return "in the morning";
  if (hour >= 12 && hour < 17) return "in the afternoon";
  if (hour >= 17 && hour < 21) return "in the evening";
  return "at night";
}

export type Word = { id: number; text: string };

export type WordChange = { words: Word[]; removed: Word[]; nextId: number };

/**
 * The new run of words, keeping the ids of the longest run of words the old
 * and new sentences share in order, so only the words that changed move in
 * or out and the rest glide to their new places.
 */
export function changeWords(previous: readonly Word[], texts: readonly string[], nextId: number): WordChange {
  const rows = previous.length + 1;
  const columns = texts.length + 1;
  const lengths = Array.from({ length: rows }, () => Array.from({ length: columns }, () => 0));
  for (let i = previous.length - 1; i >= 0; i--) {
    for (let j = texts.length - 1; j >= 0; j--) {
      lengths[i]![j] = previous[i]!.text === texts[j] ? lengths[i + 1]![j + 1]! + 1 : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  const words: Word[] = [];
  const kept = new Set<number>();
  let id = nextId;
  let i = 0;
  let j = 0;
  while (j < texts.length) {
    if (i < previous.length && previous[i]!.text === texts[j]) {
      words.push(previous[i]!);
      kept.add(previous[i]!.id);
      i++;
      j++;
    } else if (i < previous.length && lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      i++;
    } else {
      words.push({ id: id++, text: texts[j]! });
      j++;
    }
  }
  return { words, removed: previous.filter(word => !kept.has(word.id)), nextId: id };
}

export function splitWords(sentence: string): string[] {
  return sentence.split(/\s+/).filter(Boolean);
}
