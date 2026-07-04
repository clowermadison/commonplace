import { supabase } from "./supabase";

/* Ask Claude via the Supabase Edge Function proxy.
   The function holds the Anthropic API key server-side and requires a signed-in user. */
export async function askClaude(content, maxTokens = 2000) {
  const { data, error } = await supabase.functions.invoke("claude", {
    body: { messages: [{ role: "user", content }], max_tokens: maxTokens },
  });
  if (error) throw new Error(error.message || "Request to AI service failed");
  if (data?.error) throw new Error(data.error.message || "AI service error");
  return (data?.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

export function parseJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  return JSON.parse(clean.slice(start, end + 1));
}

/* ——— Photo handling ——— */
const API_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read the photo file"));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function decodeAndScale(dataUrl, maxDim = 1400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("decode-failed"));
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82).split(",")[1]);
      } catch {
        reject(new Error("decode-failed"));
      }
    };
    img.src = dataUrl;
  });
}

export async function fileToImagePayload(file) {
  const dataUrl = await readAsDataURL(file);
  try {
    const data = await decodeAndScale(dataUrl);
    return { data, media_type: "image/jpeg" };
  } catch {
    if (API_IMAGE_TYPES.includes(file.type)) {
      return { data: dataUrl.split(",")[1], media_type: file.type };
    }
    throw new Error(
      "This photo format (" + (file.type || "unknown") +
      ") can't be processed. On iPhone: Settings → Camera → Formats → \"Most Compatible\", then retake."
    );
  }
}
