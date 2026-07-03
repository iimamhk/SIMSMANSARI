const themeCatalog = {
  animals: {
    label: 'Animals',
    words: [
      { word: 'cat', translation: 'kucing', sentence: 'The cat is sleeping on the chair.' },
      { word: 'dog', translation: 'anjing', sentence: 'My dog likes to run in the yard.' },
      { word: 'bird', translation: 'burung', sentence: 'A bird is singing in the tree.' },
      { word: 'fish', translation: 'ikan', sentence: 'The fish swims in clean water.' },
      { word: 'rabbit', translation: 'kelinci', sentence: 'The rabbit eats a carrot.' },
      { word: 'cow', translation: 'sapi', sentence: 'The cow stands near the farm gate.' },
      { word: 'goat', translation: 'kambing', sentence: 'The goat is eating grass.' },
      { word: 'horse', translation: 'kuda', sentence: 'The horse runs very fast.' },
    ],
  },
  school: {
    label: 'School Objects',
    words: [
      { word: 'book', translation: 'buku', sentence: 'I read a book in the library.' },
      { word: 'pen', translation: 'pena', sentence: 'She writes with a blue pen.' },
      { word: 'pencil', translation: 'pensil', sentence: 'My pencil is on the table.' },
      { word: 'eraser', translation: 'penghapus', sentence: 'Use the eraser to fix the mistake.' },
      { word: 'bag', translation: 'tas', sentence: 'My bag is under the desk.' },
      { word: 'ruler', translation: 'penggaris', sentence: 'The ruler is twenty centimeters long.' },
      { word: 'board', translation: 'papan tulis', sentence: 'The teacher writes on the board.' },
      { word: 'chair', translation: 'kursi', sentence: 'Please sit on the chair.' },
    ],
  },
  family: {
    label: 'Family',
    words: [
      { word: 'father', translation: 'ayah', sentence: 'My father goes to work every morning.' },
      { word: 'mother', translation: 'ibu', sentence: 'My mother cooks delicious soup.' },
      { word: 'brother', translation: 'saudara laki-laki', sentence: 'My brother plays football after school.' },
      { word: 'sister', translation: 'saudara perempuan', sentence: 'My sister sings very well.' },
      { word: 'grandfather', translation: 'kakek', sentence: 'My grandfather tells funny stories.' },
      { word: 'grandmother', translation: 'nenek', sentence: 'My grandmother grows flowers.' },
      { word: 'uncle', translation: 'paman', sentence: 'My uncle visits us on Sunday.' },
      { word: 'aunt', translation: 'bibi', sentence: 'My aunt makes sweet tea.' },
    ],
  },
  food: {
    label: 'Food & Drink',
    words: [
      { word: 'apple', translation: 'apel', sentence: 'I eat an apple at break time.' },
      { word: 'bread', translation: 'roti', sentence: 'We buy bread from the shop.' },
      { word: 'rice', translation: 'nasi', sentence: 'Rice is on the dinner table.' },
      { word: 'milk', translation: 'susu', sentence: 'He drinks warm milk every night.' },
      { word: 'water', translation: 'air', sentence: 'Please drink more water.' },
      { word: 'banana', translation: 'pisang', sentence: 'The monkey likes a banana.' },
      { word: 'egg', translation: 'telur', sentence: 'She cooks one egg for breakfast.' },
      { word: 'juice', translation: 'jus', sentence: 'Cold juice tastes fresh today.' },
    ],
  },
  activities: {
    label: 'Daily Activities',
    words: [
      { word: 'read', translation: 'membaca', sentence: 'I read before going to sleep.' },
      { word: 'write', translation: 'menulis', sentence: 'They write in their notebooks.' },
      { word: 'play', translation: 'bermain', sentence: 'The children play in the field.' },
      { word: 'eat', translation: 'makan', sentence: 'We eat lunch at noon.' },
      { word: 'drink', translation: 'minum', sentence: 'I drink tea in the morning.' },
      { word: 'sleep', translation: 'tidur', sentence: 'The baby sleeps in the room.' },
      { word: 'study', translation: 'belajar', sentence: 'Students study for the test.' },
      { word: 'walk', translation: 'berjalan', sentence: 'We walk to the park together.' },
    ],
  },
};

export const vocabularyQuizTypes = {
  meaning_choice: 'English ke Indonesia',
  reverse_choice: 'Indonesia ke English',
  sentence_fill: 'Lengkapi Kalimat',
};

function uniqueShuffle(values) {
  const list = [...new Set(values)];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
  }
  return list;
}

function pickRandomItems(items, count) {
  return uniqueShuffle(items).slice(0, Math.min(count, items.length));
}

function toThemeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toThemeLabel(value) {
  return String(value || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeImportedTheme(themeValue) {
  const raw = String(themeValue || '').trim().toLowerCase();
  if (themeCatalog[raw]) {
    return {
      key: raw,
      label: themeCatalog[raw].label,
    };
  }

  const aliasEntry = Object.entries(themeCatalog).find(([, item]) => item.label.toLowerCase() === raw);
  if (aliasEntry) {
    return {
      key: aliasEntry[0],
      label: aliasEntry[1].label,
    };
  }

  const customKey = toThemeKey(themeValue);
  return {
    key: customKey || 'school',
    label: toThemeLabel(themeValue) || 'School Objects',
  };
}

function sanitizeWordBank(list = []) {
  return (Array.isArray(list) ? list : [])
    .map((item) => {
      const normalizedTheme = normalizeImportedTheme(item.theme || item.theme_key || item.theme_label);
      const word = String(item.word || '').trim().toLowerCase();
      const translation = String(item.translation || item.meaning || '').trim().toLowerCase();
      const sentence = String(item.sentence || '').trim();

      if (!word || !translation) {
        return null;
      }

      return {
        theme: normalizedTheme.key,
        theme_label: normalizedTheme.label,
        word,
        translation,
        sentence: sentence || `This is a ${word}.`,
      };
    })
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((entry) => `${entry.theme}:${entry.word}` === `${item.theme}:${item.word}`) === index);
}

function getThemeWords(themeKeys = [], customWordBank = []) {
  const normalizedCustomBank = sanitizeWordBank(customWordBank);
  const customThemeKeys = [...new Set(normalizedCustomBank.map((item) => item.theme).filter(Boolean))];
  const validThemes = themeKeys.filter((key) => themeCatalog[key] || customThemeKeys.includes(key));
  const selectedKeys = validThemes.length ? validThemes : (customThemeKeys.length ? customThemeKeys : ['school']);

  if (normalizedCustomBank.length) {
    const filteredCustomBank = normalizedCustomBank.filter((item) => selectedKeys.includes(item.theme));
    if (filteredCustomBank.length) {
      return filteredCustomBank;
    }
  }

  return selectedKeys.flatMap((key) => (themeCatalog[key]?.words || []).map((item) => ({
    ...item,
    theme: key,
    theme_label: themeCatalog[key].label,
  })));
}

function buildOptions(pool, currentWord, getValue) {
  const distractors = uniqueShuffle(
    pool
      .filter((item) => item.word !== currentWord.word)
      .map((item) => getValue(item))
  )
    .filter((value) => value !== getValue(currentWord))
    .slice(0, 3);

  return uniqueShuffle([getValue(currentWord), ...distractors]);
}

function buildMeaningQuestion(wordItem, pool, order) {
  return {
    order,
    theme: wordItem.theme,
    theme_label: wordItem.theme_label,
    prompt: `Apa arti dari "${wordItem.word}"?`,
    answer: wordItem.translation,
    correct_label: wordItem.translation,
    quiz_type: 'meaning_choice',
    options: buildOptions(pool, wordItem, (item) => item.translation),
  };
}

function buildReverseQuestion(wordItem, pool, order) {
  return {
    order,
    theme: wordItem.theme,
    theme_label: wordItem.theme_label,
    prompt: `Apa bahasa Inggris dari "${wordItem.translation}"?`,
    answer: wordItem.word,
    correct_label: wordItem.word,
    quiz_type: 'reverse_choice',
    options: buildOptions(pool, wordItem, (item) => item.word),
  };
}

function buildSentenceQuestion(wordItem, pool, order) {
  const sentenceWithBlank = wordItem.sentence.replace(new RegExp(`\\b${wordItem.word}\\b`, 'i'), '_____');
  return {
    order,
    theme: wordItem.theme,
    theme_label: wordItem.theme_label,
    prompt: `Lengkapi kalimat: ${sentenceWithBlank}`,
    answer: wordItem.word,
    correct_label: wordItem.word,
    quiz_type: 'sentence_fill',
    options: buildOptions(pool, wordItem, (item) => item.word),
  };
}

export function getVocabularyThemeCatalog() {
  return themeCatalog;
}

export function getVocabularyThemeLabel(themeKey, wordBank = []) {
  if (themeCatalog[themeKey]?.label) {
    return themeCatalog[themeKey].label;
  }

  const normalizedWordBank = sanitizeWordBank(wordBank);
  const match = normalizedWordBank.find((item) => item.theme === themeKey);
  return match?.theme_label || toThemeLabel(themeKey) || themeKey;
}

export function getVocabularyThemeOptions(wordBank = []) {
  const builtInOptions = Object.entries(themeCatalog).map(([key, item]) => ({
    key,
    label: item.label,
    is_custom: false,
  }));
  const customOptions = [...new Map(
    sanitizeWordBank(wordBank)
      .filter((item) => !themeCatalog[item.theme])
      .map((item) => [item.theme, {
        key: item.theme,
        label: item.theme_label || toThemeLabel(item.theme),
        is_custom: true,
      }])
  ).values()];

  return [...builtInOptions, ...customOptions];
}

export function normalizeVocabularySettings(rawSettings = {}) {
  const normalizedWordBank = sanitizeWordBank(rawSettings.word_bank || []);
  const availableThemes = new Set([
    ...Object.keys(themeCatalog),
    ...normalizedWordBank.map((item) => item.theme),
  ]);
  const selectedThemes = Array.isArray(rawSettings.themes)
    ? rawSettings.themes.map((item) => toThemeKey(item)).filter((item) => availableThemes.has(item))
    : ['school'];
  const selectedQuizModes = Array.isArray(rawSettings.quiz_modes)
    ? rawSettings.quiz_modes.filter((item) => vocabularyQuizTypes[item])
    : ['meaning_choice', 'reverse_choice'];

  return {
    themes: selectedThemes.length ? selectedThemes : (normalizedWordBank.length ? [...new Set(normalizedWordBank.map((item) => item.theme))] : ['school']),
    difficulty: ['basic', 'intermediate'].includes(rawSettings.difficulty) ? rawSettings.difficulty : 'basic',
    question_count: Math.max(5, Number(rawSettings.question_count || 10)),
    duration_sec: Math.max(30, Number(rawSettings.duration_sec || 180)),
    quiz_modes: selectedQuizModes.length ? selectedQuizModes : ['meaning_choice', 'reverse_choice'],
    word_bank: normalizedWordBank,
  };
}

export function generateVocabularyQuestions(settings, quizType) {
  const normalized = normalizeVocabularySettings(settings);
  const pool = getThemeWords(normalized.themes, normalized.word_bank);
  const selectedWords = pickRandomItems(pool, normalized.question_count);

  return selectedWords.map((wordItem, index) => {
    const order = index + 1;
    if (quizType === 'sentence_fill') {
      return buildSentenceQuestion(wordItem, pool, order);
    }
    if (quizType === 'reverse_choice') {
      return buildReverseQuestion(wordItem, pool, order);
    }
    return buildMeaningQuestion(wordItem, pool, order);
  });
}

export function evaluateVocabularySession(questions = [], answers = {}) {
  let correctCount = 0;
  const byTheme = {};
  const wordsToReview = [];

  const detail = questions.map((question) => {
    const studentAnswer = String(answers[question.order] || '').trim();
    const normalizedAnswer = String(question.answer || '').trim();
    const isCorrect = Boolean(studentAnswer) && studentAnswer.toLowerCase() === normalizedAnswer.toLowerCase();

    if (!byTheme[question.theme]) {
      byTheme[question.theme] = {
        label: question.theme_label,
        asked: 0,
        correct: 0,
      };
    }

    byTheme[question.theme].asked += 1;

    if (isCorrect) {
      correctCount += 1;
      byTheme[question.theme].correct += 1;
    } else {
      wordsToReview.push({
        prompt: question.prompt,
        correct_answer: question.correct_label,
        student_answer: studentAnswer || '-',
        theme: question.theme_label,
      });
    }

    return {
      order: question.order,
      theme: question.theme,
      prompt: question.prompt,
      correct_answer: question.correct_label,
      student_answer: studentAnswer || null,
      is_correct: isCorrect,
    };
  });

  const total = questions.length;
  const accuracy = total ? (correctCount / total) * 100 : 0;

  return {
    total_questions: total,
    correct_count: correctCount,
    wrong_count: Math.max(0, total - correctCount),
    accuracy: Number(accuracy.toFixed(2)),
    score: Math.round(accuracy),
    by_theme: byTheme,
    mastered_words: correctCount,
    review_count: wordsToReview.length,
    words_to_review: wordsToReview,
    questions: detail,
  };
}

export function getVocabularyWordList(settings = {}) {
  const normalized = normalizeVocabularySettings(settings);
  return getThemeWords(normalized.themes, normalized.word_bank);
}