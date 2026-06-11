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

function getSupabaseConfig() {
  const url = String(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  ).trim();
  const key = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      "",
  ).trim();
  const tableName = String(process.env.SUPABASE_SIGNUPS_TABLE || "signups").trim();

  return { url, key, tableName };
}

function validateSupabaseConfig(url, key) {
  if (!url || !key) {
    return "Supabase 환경 변수(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)가 설정되지 않았습니다.";
  }

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) {
    return "SUPABASE_URL 형식이 올바르지 않습니다. 예: https://abcdefgh.supabase.co";
  }

  if (key.startsWith("sb_publishable_")) {
    return "SUPABASE_SERVICE_ROLE_KEY에 service_role 또는 sb_secret_ 키를 넣어 주세요. publishable/anon 키는 사용할 수 없습니다.";
  }

  return null;
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

  const { url: supabaseUrl, key: supabaseKey, tableName } = getSupabaseConfig();
  const configError = validateSupabaseConfig(supabaseUrl, supabaseKey);
  if (configError) {
    return res.status(500).json({ error: configError });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "요청 형식이 올바르지 않습니다." });
    }
  }

  const { name, phone, email } = body || {};
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

  const baseUrl = supabaseUrl.replace(/\/$/, "");

  try {
    const response = await fetch(`${baseUrl}/rest/v1/${tableName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let parsedMessage = "";
      try {
        const parsed = JSON.parse(errorText);
        parsedMessage = parsed.message || parsed.error || parsed.hint || "";
      } catch {
        parsedMessage = errorText.slice(0, 200);
      }

      if (
        response.status === 409 ||
        errorText.includes("duplicate key") ||
        errorText.includes("signups_email_key")
      ) {
        return res.status(409).json({ error: "이미 가입된 이메일입니다." });
      }

      if (response.status === 401 || response.status === 403) {
        return res.status(502).json({
          error:
            "Supabase API 키가 올바르지 않습니다. Vercel에 service_role(Secret) 키를 넣었는지 확인해 주세요.",
        });
      }

      if (
        response.status === 404 ||
        parsedMessage.includes("Could not find the table") ||
        parsedMessage.includes("schema cache")
      ) {
        return res.status(502).json({
          error:
            "signups 테이블이 없습니다. Supabase SQL Editor에서 supabase/schema.sql을 실행해 주세요.",
        });
      }

      return res.status(502).json({
        error: `가입 정보 저장 실패: ${parsedMessage || `HTTP ${response.status}`}`,
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
  } catch (err) {
    return res.status(500).json({
      error: `Supabase 연결 오류: ${err.message}. SUPABASE_URL과 service_role 키를 다시 확인해 주세요.`,
    });
  }
}
