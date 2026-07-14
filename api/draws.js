const MAX_LIMIT = 50;

async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "GET") {
    return handleGet(req, res);
  }

  if (req.method === "POST") {
    return handlePost(req, res);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(req, res) {
  const config = getConfig();
  if (!config.ok) {
    return res.status(500).json({ error: config.error });
  }

  const limit = clampLimit(req.query.limit);
  const url = new URL(`${config.supabaseUrl}/rest/v1/${config.table}`);
  url.searchParams.set("select", "id,main_numbers,bonus_number,created_at");
  url.searchParams.set("order", "created_at.desc");
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, {
    headers: createHeaders(config.serviceRoleKey),
  });

  if (!response.ok) {
    return res.status(response.status).json({
      error: "Failed to fetch draws",
      details: await safeJson(response),
    });
  }

  const rows = await response.json();
  const draws = rows.map(mapRowToDraw);
  return res.status(200).json({ draws });
}

async function handlePost(req, res) {
  const config = getConfig();
  if (!config.ok) {
    return res.status(500).json({ error: config.error });
  }

  const body = await readBody(req);
  const validation = validateDraw(body);
  if (!validation.ok) {
    return res.status(400).json({ error: validation.error });
  }

  const response = await fetch(`${config.supabaseUrl}/rest/v1/${config.table}`, {
    method: "POST",
    headers: {
      ...createHeaders(config.serviceRoleKey),
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      main_numbers: validation.draw.main,
      bonus_number: validation.draw.bonus,
      created_at: validation.draw.createdAt,
    }),
  });

  if (!response.ok) {
    return res.status(response.status).json({
      error: "Failed to save draw",
      details: await safeJson(response),
    });
  }

  const rows = await response.json();
  return res.status(200).json({ draw: mapRowToDraw(rows[0]) });
}

function getConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const table = process.env.SUPABASE_DRAWS_TABLE || "lotto_draws";

  if (!supabaseUrl) {
    return { ok: false, error: "Missing SUPABASE_URL" };
  }

  if (!serviceRoleKey) {
    return { ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY" };
  }

  return { ok: true, supabaseUrl: supabaseUrl.replace(/\/$/, ""), serviceRoleKey, table };
}

function clampLimit(rawLimit) {
  const value = Number(rawLimit);
  if (!Number.isFinite(value) || value <= 0) {
    return 6;
  }

  return Math.min(Math.floor(value), MAX_LIMIT);
}

function createHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function mapRowToDraw(row) {
  return {
    id: row.id,
    main: Array.isArray(row.main_numbers) ? row.main_numbers : [],
    bonus: row.bonus_number,
    createdAt: row.created_at,
  };
}

function validateDraw(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid request body" };
  }

  const main = Array.isArray(body.main) ? body.main : null;
  const bonus = Number(body.bonus);
  const createdAt = typeof body.createdAt === "string" ? body.createdAt : new Date().toISOString();

  if (!main || main.length !== 6 || main.some((n) => !Number.isInteger(n) || n < 1 || n > 45)) {
    return { ok: false, error: "Invalid main numbers" };
  }

  if (!Number.isInteger(bonus) || bonus < 1 || bonus > 45) {
    return { ok: false, error: "Invalid bonus number" };
  }

  return { ok: true, draw: { main, bonus, createdAt } };
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

module.exports = handler;
