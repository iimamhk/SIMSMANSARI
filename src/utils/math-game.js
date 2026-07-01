const operationsCatalog = {
  add: {
    label: 'Penjumlahan',
    symbol: '+',
    solve: (a, b) => a + b,
  },
  sub: {
    label: 'Pengurangan',
    symbol: '-',
    solve: (a, b) => a - b,
  },
  mul: {
    label: 'Perkalian',
    symbol: 'x',
    solve: (a, b) => a * b,
  },
  div: {
    label: 'Pembagian',
    symbol: ':',
    solve: (a, b) => a / b,
  },
  pow: {
    label: 'Pangkat',
    symbol: '^',
    solve: (a, b) => a ** b,
  },
  root: {
    label: 'Akar',
    symbol: 'sqrt',
    solve: (a) => Math.sqrt(a),
  },
};

export const quizTypes = {
  short_answer: 'Isian Singkat',
  multiple_choice: 'Pilihan Ganda',
  matching: 'Mencocokkan',
};

export function getOperationCatalog() {
  return operationsCatalog;
}

function randomInt(min, max) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function uniqueShuffle(values) {
  const list = [...new Set(values)];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function createDistractors(answer, settings) {
  const min = Number(settings.number_min || 1);
  const max = Number(settings.number_max || 20);
  const spread = Math.max(2, Math.floor((max - min) / 4));
  const candidates = [
    answer + 1,
    answer - 1,
    answer + spread,
    answer - spread,
    answer + randomInt(2, 9),
    answer - randomInt(2, 9),
  ].filter((value) => Number.isFinite(value));

  const cleaned = candidates.map((value) => Number(value.toFixed(2)));
  const result = uniqueShuffle(cleaned).filter((value) => value !== answer).slice(0, 3);
  while (result.length < 3) {
    const fallback = randomInt(min, Math.max(max, min + 10));
    if (fallback !== answer && !result.includes(fallback)) {
      result.push(fallback);
    }
  }
  return result;
}

function generateByOperation(operation, settings) {
  const min = Number(settings.number_min || 1);
  const max = Number(settings.number_max || 20);
  const allowNegative = Boolean(settings.allow_negative);
  const maxExponent = Math.max(2, Number(settings.max_exponent || 3));
  const mulMin = Math.max(0, Number(settings.mul_number_min || min));
  const mulMax = Math.max(mulMin, Number(settings.mul_number_max || max));
  const divMin = Math.max(1, Number(settings.div_number_min || min || 1));
  const divMax = Math.max(divMin, Number(settings.div_number_max || max || 2));

  if (operation === 'div') {
    const divisor = randomInt(divMin, Math.max(2, divMax));
    const quotient = randomInt(divMin, Math.max(2, divMax));
    const dividend = divisor * quotient;
    return {
      prompt: `${dividend} : ${divisor} = ?`,
      answer: quotient,
    };
  }

  if (operation === 'pow') {
    const baseMax = Math.min(max, 12);
    const base = randomInt(Math.max(2, min), Math.max(3, baseMax));
    const exponent = randomInt(2, maxExponent);
    return {
      prompt: `${base} ^ ${exponent} = ?`,
      answer: operationsCatalog.pow.solve(base, exponent),
    };
  }

  if (operation === 'root') {
    const base = randomInt(Math.max(2, min), Math.max(3, Math.min(max, 20)));
    const square = base * base;
    return {
      prompt: `sqrt(${square}) = ?`,
      answer: base,
    };
  }

  const a = operation === 'mul' ? randomInt(mulMin, mulMax) : randomInt(min, max);
  const b = operation === 'mul' ? randomInt(mulMin, mulMax) : randomInt(min, max);

  if (operation === 'sub') {
    if (!allowNegative) {
      const maxValue = Math.max(a, b);
      const minValue = Math.min(a, b);
      return {
        prompt: `${maxValue} - ${minValue} = ?`,
        answer: operationsCatalog.sub.solve(maxValue, minValue),
      };
    }
    return {
      prompt: `${a} - ${b} = ?`,
      answer: operationsCatalog.sub.solve(a, b),
    };
  }

  if (operation === 'add') {
    return {
      prompt: `${a} + ${b} = ?`,
      answer: operationsCatalog.add.solve(a, b),
    };
  }

  return {
    prompt: `${a} x ${b} = ?`,
    answer: operationsCatalog.mul.solve(a, b),
  };
}

function buildQuestion(operation, settings, quizType, order) {
  const base = generateByOperation(operation, settings);
  const normalizedAnswer = Number(Number(base.answer).toFixed(2));
  const question = {
    order,
    operation,
    operation_label: operationsCatalog[operation]?.label || operation,
    prompt: base.prompt,
    answer: normalizedAnswer,
    quiz_type: quizType,
  };

  if (quizType === 'multiple_choice' || quizType === 'matching') {
    question.options = uniqueShuffle([normalizedAnswer, ...createDistractors(normalizedAnswer, settings)]);
  }

  return question;
}

export function normalizeGameSettings(rawSettings = {}) {
  const operations = Array.isArray(rawSettings.operations) ? rawSettings.operations : ['add', 'sub', 'mul'];
  const quizModes = Array.isArray(rawSettings.quiz_modes) ? rawSettings.quiz_modes : ['short_answer'];

  return {
    operations: operations.filter((item) => operationsCatalog[item]),
    number_min: Math.max(0, Number(rawSettings.number_min || 1)),
    number_max: Math.max(5, Number(rawSettings.number_max || 20)),
    mul_number_min: Math.max(0, Number(rawSettings.mul_number_min || rawSettings.number_min || 1)),
    mul_number_max: Math.max(5, Number(rawSettings.mul_number_max || rawSettings.number_max || 20)),
    div_number_min: Math.max(1, Number(rawSettings.div_number_min || rawSettings.number_min || 1)),
    div_number_max: Math.max(2, Number(rawSettings.div_number_max || rawSettings.number_max || 20)),
    max_exponent: Math.max(2, Number(rawSettings.max_exponent || 3)),
    question_count: Math.max(5, Number(rawSettings.question_count || 10)),
    duration_sec: Math.max(30, Number(rawSettings.duration_sec || 180)),
    allow_negative: Boolean(rawSettings.allow_negative),
    quiz_modes: quizModes.filter((mode) => quizTypes[mode]),
  };
}

export function generateMathQuestions(settings, quizType) {
  const normalized = normalizeGameSettings(settings);
  const operations = normalized.operations.length ? normalized.operations : ['add'];
  const questions = [];

  for (let index = 0; index < normalized.question_count; index += 1) {
    const op = operations[index % operations.length];
    questions.push(buildQuestion(op, normalized, quizType, index + 1));
  }

  return uniqueShuffle(questions).map((item, index) => ({ ...item, order: index + 1 }));
}

export function evaluateMathSession(questions = [], answers = {}) {
  let correctCount = 0;
  const byOperation = {};

  const detail = questions.map((question) => {
    const rawAnswer = answers[question.order];
    const studentAnswer = rawAnswer === '' || rawAnswer === null || rawAnswer === undefined ? null : Number(rawAnswer);
    const isCorrect = studentAnswer !== null && Number(studentAnswer) === Number(question.answer);

    if (!byOperation[question.operation]) {
      byOperation[question.operation] = { asked: 0, correct: 0 };
    }
    byOperation[question.operation].asked += 1;
    if (isCorrect) {
      byOperation[question.operation].correct += 1;
      correctCount += 1;
    }

    return {
      order: question.order,
      operation: question.operation,
      prompt: question.prompt,
      correct_answer: question.answer,
      student_answer: studentAnswer,
      is_correct: isCorrect,
    };
  });

  const total = questions.length;
  const accuracy = total ? (correctCount / total) * 100 : 0;
  const score = Math.round(accuracy);

  return {
    total_questions: total,
    correct_count: correctCount,
    wrong_count: Math.max(0, total - correctCount),
    accuracy: Number(accuracy.toFixed(2)),
    score,
    by_operation: byOperation,
    questions: detail,
  };
}
