// Browser/OS details sent with feedback so the Juise team can reproduce
// issues. Everything here is information every website already receives (the
// User-Agent and User-Agent Client Hints, screen size, language, time zone):
// no permission prompt, nothing the user has to approve.
//
// The keys match nebula-user-server's feedback client_info allowlist.

export type ClientInfo = Record<string, string>;

type BrandVersion = { brand: string; version: string };

type UADataValues = {
  platform?: string;
  platformVersion?: string;
  fullVersionList?: BrandVersion[];
};

// navigator.userAgentData (Chromium only) isn't in TypeScript's DOM lib yet.
type NavigatorUAData = {
  brands?: BrandVersion[];
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<UADataValues>;
};

// Preferred names when a browser reports several brands (Edge and Opera also
// report "Chromium"/"Google Chrome").
const BRAND_PRIORITY = ["Microsoft Edge", "Opera", "Google Chrome", "Chromium"];
const BRAND_NAMES: Record<string, string> = {
  "Microsoft Edge": "Edge",
  Opera: "Opera",
  "Google Chrome": "Chrome",
  Chromium: "Chromium",
};

function pickBrand(
  brands: BrandVersion[] | undefined,
): BrandVersion | undefined {
  if (!brands?.length) return undefined;
  for (const name of BRAND_PRIORITY) {
    const found = brands.find((b) => b.brand === name);
    if (found) return found;
  }
  // Skip GREASE entries like "Not A(Brand".
  return brands.find((b) => !/not.?a.?brand/i.test(b.brand));
}

export type ParsedUserAgent = {
  browser_name?: string;
  browser_version?: string;
  os_name?: string;
  os_version?: string;
};

// Best-effort parse of a User-Agent string. Order matters: Edge and Opera
// also contain "Chrome/", and Chrome contains "Safari/".
export function parseUserAgent(ua: string): ParsedUserAgent {
  const out: ParsedUserAgent = {};
  const match = (re: RegExp) => ua.match(re)?.[1];

  const browsers: [name: string, re: RegExp][] = [
    ["Edge", /Edg(?:e|A|iOS)?\/([\d.]+)/],
    ["Opera", /(?:OPR|OPiOS)\/([\d.]+)/],
    ["Samsung Internet", /SamsungBrowser\/([\d.]+)/],
    ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/],
    ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari\//],
  ];
  for (const [name, re] of browsers) {
    const version = match(re);
    if (version) {
      out.browser_name = name;
      out.browser_version = version;
      break;
    }
  }

  let v: string | undefined;
  if ((v = match(/(?:iPhone|iPad|iPod).*? OS (\d+(?:_\d+)*)/))) {
    out.os_name = "iOS";
    out.os_version = v.replace(/_/g, ".");
  } else if ((v = match(/Android (\d+(?:\.\d+)*)/))) {
    out.os_name = "Android";
    out.os_version = v;
  } else if ((v = match(/Windows NT (\d+\.\d+)/))) {
    out.os_name = "Windows";
    // NT 10.0 is both Windows 10 and 11; Client Hints can tell them apart.
    out.os_version =
      { "10.0": "10/11", "6.3": "8.1", "6.2": "8", "6.1": "7" }[v] ?? v;
  } else if (/CrOS/.test(ua)) {
    out.os_name = "ChromeOS";
  } else if (/Macintosh|Mac OS X/.test(ua)) {
    // Browsers freeze the macOS version in the UA at 10.15.7, so it's not
    // reported; Client Hints give the real one on Chromium.
    out.os_name = "macOS";
  } else if (/Linux/.test(ua)) {
    out.os_name = "Linux";
  }
  return out;
}

// Real OS version from Client Hints: Windows reports platformVersion >= 13
// for Windows 11; macOS reports e.g. "15.1.0".
function osFromHints(
  platform: string | undefined,
  platformVersion: string | undefined,
): Pick<ParsedUserAgent, "os_name" | "os_version"> {
  if (!platform) return {};
  const os: Pick<ParsedUserAgent, "os_name" | "os_version"> = {
    os_name: platform === "Chrome OS" ? "ChromeOS" : platform,
  };
  if (platformVersion) {
    const major = Number.parseInt(platformVersion, 10);
    if (platform === "Windows")
      os.os_version = major >= 13 ? "11" : major > 0 ? "10" : undefined;
    else os.os_version = platformVersion.replace(/(\.0)+$/, "");
  }
  return os;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) =>
      setTimeout(() => resolve(undefined), ms),
    ),
  ]);
}

// Never throws: returns whatever it could read. Client Hints are tried first
// (accurate OS version and full browser version on Chromium), falling back
// to the User-Agent string everywhere else.
export async function getClientInfo(): Promise<ClientInfo> {
  const info: ClientInfo = { platform: "web" };
  try {
    const ua = navigator.userAgent ?? "";
    if (ua) info.user_agent = ua;
    Object.assign(info, parseUserAgent(ua));

    const uaData = (
      navigator as Navigator & { userAgentData?: NavigatorUAData }
    ).userAgentData;
    if (uaData?.getHighEntropyValues) {
      const hints = await withTimeout(
        uaData
          .getHighEntropyValues(["platformVersion", "fullVersionList"])
          .catch(() => undefined),
        500,
      );
      const brand =
        pickBrand(hints?.fullVersionList) ?? pickBrand(uaData.brands);
      if (brand) {
        info.browser_name = BRAND_NAMES[brand.brand] ?? brand.brand;
        info.browser_version = brand.version;
      }
      const os = osFromHints(
        hints?.platform ?? uaData.platform,
        hints?.platformVersion,
      );
      if (os.os_name) info.os_name = os.os_name;
      if (os.os_version) info.os_version = os.os_version;
    }

    const locale = Intl.DateTimeFormat().resolvedOptions();
    if (locale.locale) info.locale = locale.locale;
    if (locale.timeZone) info.timezone = locale.timeZone;
    if (window.screen?.width)
      info.screen = `${window.screen.width}x${window.screen.height}`;
    if (window.innerWidth)
      info.viewport = `${window.innerWidth}x${window.innerHeight}`;
  } catch {
    // Device info is a nice-to-have; never let it block submitting feedback.
  }
  for (const key of Object.keys(info)) {
    if (!info[key]) delete info[key];
  }
  return info;
}
