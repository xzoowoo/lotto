function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function isValidPhone(phone) {
  const digits = normalizePhone(phone);
  return /^01[016789]\d{7,8}$/.test(digits);
}

function formatPhone(digits) {
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
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

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tableName = process.env.SUPABASE_SIGNUPS_TABLE || "signups";

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: "Supabase 환경 변수(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)가 설정되지 않았습니다.",
    });
  }

  const { name, phone, email } = req.body || {};
  const trimmedName = String(name || "").trim();
  const phoneDigits = normalizePhone(phone);
  const trimmedEmail = String(email || "").trim().toLowerCase();

  if (trimmedName.length < 2) {
    return res.status(400).json({ error: "이름을 2글자 이상 입력해 주세요." });
  }

  if (!isValidPhone(phoneDigits)) {
    return res.status(400).json({ error: "올바른 휴대폰 번호를 입력해 주세요. (예: 010-1234-5678)" });
  }

  if (!isValidEmail(trimmedEmail)) {
    return res.status(400).json({ error: "올바른 이메일 주소를 입력해 주세요." });
  }

  const row = {
    name: trimmedName,
    phone: formatPhone(phoneDigits),
    email: trimmedEmail,
    source: "lotto-draw-popup",
  };

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${tableName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });

    if (!response.ok) {
      const errorText = await response.text();

      if (
        response.status === 409 ||
        errorText.includes("duplicate key") ||
        errorText.includes("signups_email_key")
      ) {
        return res.status(409).json({ error: "이미 가입된 이메일입니다." });
      }

      return res.status(502).json({
        error: "가입 정보 저장에 실패했습니다. Supabase 테이블 설정을 확인해 주세요.",
      });
    }

    return res.status(200).json({
      ok: true,
      message: "가입이 완료되었습니다. AI 맞춤 번호 추천 소식을 보내 드릴게요!",
      user: {
        name: trimmedName,
        phone: row.phone,
        email: trimmedEmail,
      },
    });
  } catch {
    return res.status(500).json({ error: "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." });
  }
}
