const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash'];
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const numbersIn = (text) =>
  (text.replace(/\b[A-Z]{2,3}-?[A-Z]*\d+\b/g, ' ').match(/\d[\d,]*(?:\.\d+)?/g) ?? [])
    .map((n) => Number(n.replace(/,/g, '')));

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let input;
  try { input = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400); }
  const { baseline, candidates } = input ?? {};
  if (!baseline || !Array.isArray(candidates) || candidates.length === 0 || candidates.length > 10)
    return json({ error: 'Invalid input' }, 400);
  const allowed = new Set(numbersIn(JSON.stringify(input)));
  const key = (process.env.GEMINI_API_KEY ?? process.env.gemini_key ?? '').trim().replace(/^["']|["']$/g, '');
  if (!key) return json({ ok: false, reason: 'no_key' });
  const system = 'You are an airline recovery dispatcher. Choose exactly ONE candidate id from the list and explain why in at most 3 sentences. Use ONLY numbers that appear in the input, copied exactly. Do not invent actions or numbers. Reply as JSON: {"recommendedId":"<id>","explanation":"<text>"}.';
  let detail = '';
  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
      });
      if (!res.ok) { detail = `${model} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`; console.error(detail); continue; }
      const data = await res.json();
      const raw = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
      const out = JSON.parse(raw || '{}');
      const valid = candidates.some((c) => c.id === out.recommendedId);
      const text = String(out.explanation ?? '');
      const verified = valid && text.length > 0 && numbersIn(text).every((n) => allowed.has(n));
      if (!verified) return json({ ok: false, reason: 'number_mismatch' });
      return json({ ok: true, recommendedId: out.recommendedId, explanation: text });
    } catch (e) {
      detail = `${model} error: ${String(e).slice(0, 200)}`; console.error(detail);
      continue;
    }
  }
  return json({ ok: false, reason: 'api_error', detail });
};
