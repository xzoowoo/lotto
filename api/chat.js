const MODEL = "gemini-2.5-flash-lite";

const SYSTEM_PROMPT = `당신은 한국어로 대화하는 로또 행운 상담 AI입니다.
- 사용자 생년월일 기반 행운(띠, 별자리, 수비학)과 오늘 날짜의 운세를 반영해 로또 번호를 추천합니다.
- main: 1~45 중 중복 없는 정수 6개(오름차순), bonus: main에 없는 1~45 정수 1개
- 가능하면 제공된 생년월일 행운 숫자 중 1개 이상 포함하세요.
- reply: 왜 이 번호를 추천했는지 생년월일·오늘의 운세를 근거로 3~6문장으로 친근하게 설명하세요.
- 번호마다 간단한 이유를 reply에 자연스럽게 녹여 주세요.
- 참고용이며 당첨을 보장하지 않음을 마지막에 한 문장으로 언급하세요.
- 사용자가 번호 추천 외 질문을 하면 운세·행운 관점에서 답하고, 필요하면 새 번호 세트를 제안하세요.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    main: {
      type: "array",
      items: { type: "integer" },
      description: "추천 로또 번호 6개 (1~45, 중복 없음)",
    },
    bonus: {
      type: "integer",
      description: "보너스 번호 1개 (1~45, main과 중복 없음)",
    },
    reply: {
      type: "string",
      description: "추천 이유 설명 (한국어)",
    },
  },
  required: ["main", "bonus", "reply"],
};

function sanitizeLottoSet(main, bonus) {
  if (!Array.isArray(main)) return null;

  const nums = main
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 45);

  const unique = [...new Set(nums)];
  if (unique.length !== 6) return null;

  const bonusNum = Number(bonus);
  if (
    !Number.isInteger(bonusNum) ||
    bonusNum < 1 ||
    bonusNum > 45 ||
    unique.includes(bonusNum)
  ) {
    return null;
  }

  return {
    main: unique.sort((a, b) => a - b),
    bonus: bonusNum,
  };
}

function buildContextBlock(birthDate, birthDateLabel, luckyNumbers, today, todayLabel) {
  return [
    "[컨텍스트]",
    `생년월일: ${birthDateLabel} (${birthDate})`,
    `생년월일 행운 숫자: ${luckyNumbers.length ? luckyNumbers.join(", ") : "없음"}`,
    `오늘 날짜: ${todayLabel} (${today})`,
    "위 정보를 반영해 오늘의 운세와 함께 로또 번호를 추천하세요.",
  ].join("\n");
}

function toGeminiContents(messages, contextBlock) {
  const contents = [];

  messages.forEach((msg, index) => {
    const role = msg.role === "assistant" ? "model" : "user";
    let text = msg.text;

    if (index === 0 && role === "user") {
      text = `${contextBlock}\n\n[사용자]\n${text}`;
    }

    contents.push({
      role,
      parts: [{ text }],
    });
  });

  return contents;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST만 지원합니다." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY 환경 변수가 설정되지 않았습니다. Vercel 프로젝트 설정에서 추가해 주세요.",
    });
  }

  const {
    birthDate,
    birthDateLabel,
    luckyNumbers = [],
    today,
    todayLabel,
    messages = [],
  } = req.body || {};

  if (!birthDate || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "생년월일과 메시지가 필요합니다." });
  }

  const contextBlock = buildContextBlock(
    birthDate,
    birthDateLabel || birthDate,
    luckyNumbers,
    today || new Date().toISOString().slice(0, 10),
    todayLabel || today || "오늘",
  );

  const geminiBody = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: toGeminiContents(messages, contextBlock),
    generationConfig: {
      temperature: 0.9,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      const message =
        data?.error?.message || `Gemini API 오류 (${response.status})`;
      return res.status(response.status).json({ error: message });
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return res.status(502).json({ error: "AI 응답을 받지 못했습니다." });
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return res.status(502).json({ error: "AI 응답 형식이 올바르지 않습니다." });
    }

    const lotto = sanitizeLottoSet(parsed.main, parsed.bonus);
    if (!lotto) {
      return res.status(502).json({ error: "추천 번호 형식이 올바르지 않습니다." });
    }

    return res.status(200).json({
      main: lotto.main,
      bonus: lotto.bonus,
      reply: String(parsed.reply || "").trim() || "오늘의 운세를 반영해 번호를 추천드렸어요.",
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message || "서버 오류가 발생했습니다.",
    });
  }
}
