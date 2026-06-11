function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

  const { name, email } = req.body || {};
  const trimmedName = String(name || "").trim();
  const trimmedEmail = String(email || "").trim().toLowerCase();

  if (trimmedName.length < 2) {
    return res.status(400).json({ error: "이름을 2글자 이상 입력해 주세요." });
  }

  if (!isValidEmail(trimmedEmail)) {
    return res.status(400).json({ error: "올바른 이메일 주소를 입력해 주세요." });
  }

  const payload = {
    name: trimmedName,
    email: trimmedEmail,
    createdAt: new Date().toISOString(),
    source: "lotto-draw-popup",
  };

  const webhook = process.env.SIGNUP_WEBHOOK_URL;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      return res.status(502).json({ error: "가입 정보 전송에 실패했습니다. 잠시 후 다시 시도해 주세요." });
    }
  }

  return res.status(200).json({
    ok: true,
    message: "가입이 완료되었습니다. AI 맞춤 번호 추천 소식을 보내 드릴게요!",
    user: { name: trimmedName, email: trimmedEmail },
  });
}
