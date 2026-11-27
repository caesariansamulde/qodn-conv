export interface DeviceFingerprintInfo {
  fingerprint: string;
  fingerprintFull: string;
  browser: string;
  os: string;
  gpu: string;
  screen: string;
  timezone: string;
  cores: number | null;
  memoryGb: number | null;
  language: string;
  collectedAt: string;
}

let cachedPromise: Promise<DeviceFingerprintInfo> | null = null;

function detectBrowserName(ua: string): string {
  const edg = ua.match(/Edg\/(\d+)/);
  if (edg) return `Edge ${edg[1]}`;
  const opr = ua.match(/OPR\/(\d+)/);
  if (opr) return `Opera ${opr[1]}`;
  const chrome = ua.match(/Chrome\/(\d+)/);
  if (chrome) return `Chrome ${chrome[1]}`;
  const firefox = ua.match(/Firefox\/(\d+)/);
  if (firefox) return `Firefox ${firefox[1]}`;
  const safari = ua.match(/Version\/(\d+).*Safari/);
  if (safari) return `Safari ${safari[1]}`;
  return "Web Browser";
}

function detectOsName(ua: string, platform: string): string {
  if (/Windows NT 10\.0/i.test(ua)) return "Windows 10/11";
  if (/Windows/i.test(ua) || /Win/i.test(platform)) return "Windows";
  if (/Mac OS X/i.test(ua) || /Mac/i.test(platform)) return "macOS";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Linux/i.test(ua) || /Linux/i.test(platform)) return "Linux";
  return platform || "Unknown OS";
}

function getWebGlGpu(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return "Unavailable";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    if (dbg) {
      const renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
      if (typeof renderer === "string" && renderer.trim()) {
        return renderer.trim().slice(0, 120);
      }
    }
    const basic = gl.getParameter(gl.RENDERER);
    return typeof basic === "string" && basic.trim() ? basic.trim().slice(0, 120) : "WebGL";
  } catch {
    return "Unavailable";
  }
}

function getCanvasSignal(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 220;
    canvas.height = 40;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#16a34a";
    ctx.fillRect(4, 4, 60, 20);
    ctx.fillStyle = "#0f172a";
    ctx.fillText("QuickODN-FP-v1", 8, 8);
    return canvas.toDataURL().slice(-64);
  } catch {
    return "";
  }
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback FNV-1a hex if Web Crypto is unavailable
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(16, "0");
}

export function getDeviceFingerprint(): Promise<DeviceFingerprintInfo> {
  if (cachedPromise) return cachedPromise;
  cachedPromise = (async () => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return {
        fingerprint: "FP-SERVER000000",
        fingerprintFull: "0".repeat(64),
        browser: "Node",
        os: "Server",
        gpu: "None",
        screen: "0x0",
        timezone: "UTC",
        cores: null,
        memoryGb: null,
        language: "en",
        collectedAt: new Date().toISOString(),
      };
    }

    const ua = navigator.userAgent || "";
    const platform = navigator.platform || "";
    const language = navigator.language || "en";
    const languages = Array.isArray(navigator.languages) ? navigator.languages.join(",") : language;
    const screenStr =
      typeof screen !== "undefined"
        ? `${screen.width}x${screen.height}x${screen.colorDepth}@${window.devicePixelRatio || 1}x`
        : "0x0";
    const timezone = (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      } catch {
        return "UTC";
      }
    })();
    const tzOffset = new Date().getTimezoneOffset();
    const cores = typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : null;
    const memoryGb =
      typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === "number"
        ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory!
        : null;
    const gpu = getWebGlGpu();
    const canvasSig = getCanvasSignal();

    const rawSignal = [
      ua,
      platform,
      languages,
      screenStr,
      timezone,
      tzOffset,
      cores ?? "",
      memoryGb ?? "",
      gpu,
      canvasSig,
    ].join("|");

    const fullHex = await sha256Hex(rawSignal);
    return {
      fingerprint: `FP-${fullHex.slice(0, 12).toUpperCase()}`,
      fingerprintFull: fullHex,
      browser: detectBrowserName(ua),
      os: detectOsName(ua, platform),
      gpu,
      screen:
        typeof screen !== "undefined"
          ? `${screen.width}x${screen.height} @${window.devicePixelRatio || 1}x`
          : "Unknown",
      timezone,
      cores,
      memoryGb,
      language,
      collectedAt: new Date().toISOString(),
    };
  })();
  return cachedPromise;
}
