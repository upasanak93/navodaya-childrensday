// POST /api/register  ->  validates the registration, sends it to the Google Form,
// and reports success ONLY if Google confirms it recorded the response.

const FORM_ACTION = "https://docs.google.com/forms/d/e/1FAIpQLSeL7bz9Za1Orcz2l6KXlbZNOJut_V0JUkYAftkRkGPyIzx5iQ/formResponse";
const ENTRY = {
  parent: "entry.2000924107", phone: "entry.1685429843", wing: "entry.451788714",
  convenor: "entry.44753248", kids: "entry.1541333513", comp: "entry.656548775", confirm: "entry.1744963757",
};
const CONFIRM_TEXT = "I confirm that the details provided above are correct and my child/children will participate in the selected competition(s).";

// Exact labels used in the Google Form. NOTE: Pencil Drawing has TWO spaces after the emoji.
const LABELS = {
  think: "🎤 Think & Speak",
  fancy: "🎭 Fancy Dress Competition",
  brain: "🧠 Brain Buzz",
  colour: "🎨 Colouring Competition",
  pencil: "✏️  Pencil Drawing",
};
const AGE = { colour: [4, 6], pencil: [7, 15] };
const WINGS = ["Rakka", "Other"];
const CONVENORS = ["Krishnadas N", "Riyas", "Shihabudheen", "Fazil", "Lishitha", "Sandeep V", "Ashraf", "Hisana Liyaquath", "Sabri Abdul Razak", "Hakeem", "Jose", "Femila"];

const json = (status, body) => ({ statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const str = (v, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function validate(d) {
  const parent = str(d.parent), phone = str(d.phone, 40), wing = str(d.wing), convenor = str(d.convenor);
  if (!parent) return "Parent name is required.";
  if (phone.length < 7) return "A valid contact number is required.";
  if (!WINGS.includes(wing)) return "Please choose a wing / unit.";
  if (!CONVENORS.includes(convenor)) return "Please choose a cluster convenor.";
  if (d.confirm !== true) return "Please confirm the registration.";
  if (!Array.isArray(d.children) || d.children.length < 1 || d.children.length > 6) return "Add between 1 and 6 children.";
  const children = [];
  for (const [i, c] of d.children.entries()) {
    const name = str(c.name), school = str(c.school), age = parseInt(c.age, 10);
    const events = Array.isArray(c.events) ? [...new Set(c.events)] : [];
    const n = i + 1;
    if (!name || !school) return `Child ${n}: name and school/class are required.`;
    if (!(age >= 1 && age <= 18)) return `Child ${n}: enter a valid age.`;
    if (!events.length) return `Child ${n}: pick at least one event.`;
    for (const e of events) {
      if (!LABELS[e]) return `Child ${n}: unknown event.`;
      if (AGE[e] && (age < AGE[e][0] || age > AGE[e][1])) return `Child ${n}: age ${age} is outside the age group for ${LABELS[e]}.`;
    }
    children.push({ name, school, age, events });
  }
  return { parent, phone, wing, convenor, children };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  let data;
  try { data = JSON.parse(event.body || "{}"); } catch { return json(400, { ok: false, error: "Invalid request." }); }

  const v = validate(data);
  if (typeof v === "string") return json(400, { ok: false, error: v });

  const body = new URLSearchParams();
  body.append(ENTRY.parent, v.parent);
  body.append(ENTRY.phone, v.phone);
  body.append(ENTRY.wing, v.wing);
  body.append(ENTRY.convenor, v.convenor);
  body.append(ENTRY.kids, v.children.map((c, i) => `${i + 1}. ${c.name} | Age ${c.age} | ${c.school} | Events: ${c.events.map((e) => LABELS[e]).join(", ")}`).join("\n"));
  const all = [...new Set(v.children.flatMap((c) => c.events))];
  all.forEach((e) => body.append(ENTRY.comp, LABELS[e]));
  body.append(ENTRY.confirm, CONFIRM_TEXT);

  try {
    const res = await fetch(FORM_ACTION, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, redirect: "follow" });
    const text = await res.text();
    // Google shows a confirmation page when the response is recorded. Anything else = not recorded.
    const recorded = res.ok && (/freebirdFormviewerViewResponseConfirmationMessage/.test(text) || /response has been recorded/i.test(text));
    if (!recorded) {
      console.error("Google did not confirm. status=" + res.status, text.slice(0, 300));
      return json(502, { ok: false, error: "google_rejected" });
    }
    return json(200, { ok: true });
  } catch (err) {
    console.error("Send failed", err);
    return json(502, { ok: false, error: "send_failed" });
  }
};
