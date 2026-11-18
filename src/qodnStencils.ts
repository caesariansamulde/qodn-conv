import type { DxfHandleFn, DxfPairFn } from "./qodnBlockDefs";

export type QodnBoxKind = "X_BOX" | "HUB_BOX" | "SUB_BOX" | "END_BOX" | "CLOSURE";

export interface QodnAttrPlacement {
  x: number;
  y: number;
  alignX: number;
  alignY: number;
  halign: number;
  height: number;
}

export interface QodnPointClassification {
  kind: QodnBoxKind;
  blockName: "P_X_BOX" | "P_HUB_BOX" | "P_SUB_BOX" | "P_END_BOX" | "P-Joint";
  layer: "X BOX" | "HUB BOX" | "SUB BOX" | "END BOX" | "P-JOINT";
  attrTag: string;
  attrValue: string;
  secondaryAttrTag?: string;
  secondaryAttrValue?: string;
  scaleFactor: number;
  color: number;
  attrOffset: QodnAttrPlacement;
  secondaryAttrOffset?: QodnAttrPlacement;
}

export interface QodnCableStyle {
  layer:
    | "1 CORE PRECONNECTED CABLE"
    | "4 CORE PRECONNECTED CABLE"
    | "P-DISTRIBUTION CABLE 72 FOC"
    | "P-DISTRIBUTION CABLE 144 FOC";
  color: number;
  label: string;
}

function withProjectPrefix(name: string, projectPrefix: string): string {
  const clean = name.trim().toUpperCase().replace(/\s+/g, "_");
  if (!projectPrefix) return clean;
  if (clean.startsWith(`${projectPrefix}_`)) return clean;
  return `${projectPrefix}_${clean}`;
}

export function classifyQodnPoint(
  name: string,
  folder = "",
  projectPrefix = "",
): QodnPointClassification | null {
  const raw = (name || "").trim();
  const upper = raw.toUpperCase();
  const folderUpper = (folder || "").toUpperCase();

  // Derive prefix from folderChain (e.g. "MIN447-KALAMANSIG/...") if projectPrefix was not passed
  let prefix = (projectPrefix || "").trim().toUpperCase();
  if (!prefix) {
    const mFolder = folderUpper.match(/(?:^|[/\\])([A-Z]{2,5}\d{1,5})(?:[_\-\s/]|$)/);
    if (mFolder) prefix = mFolder[1];
  }

  // 1. Closure / Joint
  if (/\bCLOSURE\b|\bFOSC\b|\bJOINT\b/i.test(upper)) {
    return {
      kind: "CLOSURE",
      blockName: "P-Joint",
      layer: "P-JOINT",
      attrTag: "JT_ID",
      attrValue: /\bEX(ISTING)?\b/i.test(upper) ? "EXISTING" : "PROPOSED",
      secondaryAttrTag: "JOINT",
      secondaryAttrValue: upper.replace(/^PROPOSED\s+/i, "").trim() || "72F CLOSURE",
      scaleFactor: 1.0,
      color: 1,
      attrOffset: { x: -15.601, y: -5.7649, alignX: -15.601, alignY: -5.7649, halign: 0, height: 2.0 },
      secondaryAttrOffset: { x: -1.4582, y: -8.7218, alignX: -1.4582, alignY: -8.7218, halign: 0, height: 2.0 },
    };
  }

  // 2. X BOX (e.g. "XBOX 1", "X_BOX1", "MIN447_P001")
  const xboxMatch = upper.match(/\bX[\s_-]*BOX[\s_-]*0*(\d+)\b/);
  const pBoxMatch = upper.match(/(?:^|_)P0*(\d{1,3})$/);
  if (xboxMatch || pBoxMatch) {
    const num = (xboxMatch?.[1] || pBoxMatch?.[1] || "1").padStart(3, "0");
    const attrValue = prefix ? `${prefix}_P${num}` : `P${num}`;
    return {
      kind: "X_BOX",
      blockName: "P_X_BOX",
      layer: "X BOX",
      attrTag: "X_BOX_NAME",
      attrValue,
      scaleFactor: 1.879,
      color: 1,
      attrOffset: { x: -3.588, y: 3.7184, alignX: 0.1761, alignY: 3.7184, halign: 1, height: 0.88 },
    };
  }

  // 3. HUB BOX (e.g. "HUBBOX 1", "HUB_BOX 2", "MIN447_HB01")
  const hubMatch = upper.match(/\bHUB[\s_-]*BOX[\s_-]*0*(\d+)\b/) || upper.match(/(?:^|_)HB0*(\d{1,3})\b/);
  if (hubMatch) {
    const num = hubMatch[1].padStart(2, "0");
    const attrValue = prefix ? `${prefix}_HB${num}` : `HB${num}`;
    return {
      kind: "HUB_BOX",
      blockName: "P_HUB_BOX",
      layer: "HUB BOX",
      attrTag: "HUB_BOX_NAME",
      attrValue,
      scaleFactor: 1.794,
      color: 1,
      attrOffset: { x: -7.10, y: 2.5438, alignX: -0.0232, alignY: 2.5438, halign: 1, height: 1.618 },
    };
  }

  // 4. END BOX (e.g. "L901N70", "MIN447_L901N70", or explicit "END BOX")
  const isEndBox =
    /\bL\d+N70\b/i.test(upper) ||
    /\bEND[\s_-]*BOX\b/i.test(upper) ||
    /\bEND[\s_-]*BOX\b/i.test(folderUpper);
  if (isEndBox) {
    return {
      kind: "END_BOX",
      blockName: "P_END_BOX",
      layer: "END BOX",
      attrTag: "END_BOX_NAME",
      attrValue: withProjectPrefix(raw, prefix),
      scaleFactor: 1.547,
      color: 1,
      attrOffset: { x: -4.6065, y: 2.6768, alignX: 0.5837, alignY: 2.6768, halign: 1, height: 1.618 },
    };
  }

  // 5. SUB BOX (e.g. "L901N67", "L901N68", "L901N69", or explicit "SUB BOX")
  const isSubBox =
    /\bL\d+N\d+\b/i.test(upper) ||
    /\bSUB[\s_-]*BOX\b/i.test(upper) ||
    /\bSUB[\s_-]*BOX\b/i.test(folderUpper);
  if (isSubBox) {
    return {
      kind: "SUB_BOX",
      blockName: "P_SUB_BOX",
      layer: "SUB BOX",
      attrTag: "SUB_BOX_NAME",
      attrValue: withProjectPrefix(raw, prefix),
      scaleFactor: 0.34,
      color: 1,
      attrOffset: { x: -27.768, y: 10.8548, alignX: 6.5315, alignY: 10.8548, halign: 1, height: 7.36 },
    };
  }

  return null;
}

export function resolveQodnCableStyle(name: string): QodnCableStyle | null {
  const upper = (name || "").trim().toUpperCase();
  if (/\b1[\s_-]*CORE\b/.test(upper)) {
    return {
      layer: "1 CORE PRECONNECTED CABLE",
      color: 10,
      label: "PROP. 1 CORE PRECONNECTED",
    };
  }
  if (/\b4[\s_-]*CORE\b/.test(upper)) {
    return {
      layer: "4 CORE PRECONNECTED CABLE",
      color: 10,
      label: "PROP. 4 CORE PRECONNECTED",
    };
  }
  if (/\b72\s*F(?:OC)?\b/.test(upper)) {
    return {
      layer: "P-DISTRIBUTION CABLE 72 FOC",
      color: 3,
      label: "PROP. 72FOC",
    };
  }
  if (/\b144\s*F(?:OC)?\b/.test(upper)) {
    return {
      layer: "P-DISTRIBUTION CABLE 144 FOC",
      color: 3,
      label: "PROP. 144FOC",
    };
  }
  return null;
}

export function buildQodnBlockInsertEntities(
  qodn: QodnPointClassification,
  cadPoint: { x: number; y: number; z: number },
  baseScale: number,
  usesRawCoordinates: boolean,
  dxfPair: DxfPairFn,
  dxfHandle: DxfHandleFn,
  cadCoord: (v: number) => string,
  cadSize: (v: number) => string,
  sanitizeText: (s: string) => string,
): string[] {
  const scale = usesRawCoordinates ? 0.00001 * qodn.scaleFactor : baseScale * qodn.scaleFactor;
  const entities: string[] = [];

  entities.push(
    [
      dxfPair(0, "INSERT"),
      dxfPair(5, dxfHandle()),
      dxfPair(100, "AcDbEntity"),
      dxfPair(8, qodn.layer),
      dxfPair(62, qodn.color),
      dxfPair(100, "AcDbBlockReference"),
      dxfPair(66, 1),
      dxfPair(2, qodn.blockName),
      dxfPair(10, cadCoord(cadPoint.x)),
      dxfPair(20, cadCoord(cadPoint.y)),
      dxfPair(30, cadCoord(cadPoint.z)),
      dxfPair(41, cadSize(scale)),
      dxfPair(42, cadSize(scale)),
      dxfPair(43, cadSize(scale)),
    ].join("\n"),
  );

  entities.push(
    [
      dxfPair(0, "ATTRIB"),
      dxfPair(5, dxfHandle()),
      dxfPair(100, "AcDbEntity"),
      dxfPair(8, qodn.layer),
      dxfPair(62, qodn.color),
      dxfPair(100, "AcDbText"),
      dxfPair(10, cadCoord(cadPoint.x + qodn.attrOffset.x * scale)),
      dxfPair(20, cadCoord(cadPoint.y + qodn.attrOffset.y * scale)),
      dxfPair(30, cadCoord(cadPoint.z)),
      dxfPair(40, cadSize(qodn.attrOffset.height * scale)),
      dxfPair(1, sanitizeText(qodn.attrValue)),
      dxfPair(7, "BOLD"),
      dxfPair(72, qodn.attrOffset.halign),
      dxfPair(11, cadCoord(cadPoint.x + qodn.attrOffset.alignX * scale)),
      dxfPair(21, cadCoord(cadPoint.y + qodn.attrOffset.alignY * scale)),
      dxfPair(31, cadCoord(cadPoint.z)),
      dxfPair(100, "AcDbAttribute"),
      dxfPair(280, 0),
      dxfPair(2, qodn.attrTag),
      dxfPair(70, 0),
      dxfPair(280, 0),
    ].join("\n"),
  );

  if (qodn.secondaryAttrTag && qodn.secondaryAttrValue && qodn.secondaryAttrOffset) {
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, qodn.layer),
        dxfPair(62, qodn.color),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(cadPoint.x + qodn.secondaryAttrOffset.x * scale)),
        dxfPair(20, cadCoord(cadPoint.y + qodn.secondaryAttrOffset.y * scale)),
        dxfPair(30, cadCoord(cadPoint.z)),
        dxfPair(40, cadSize(qodn.secondaryAttrOffset.height * scale)),
        dxfPair(1, sanitizeText(qodn.secondaryAttrValue)),
        dxfPair(7, "BOLD"),
        dxfPair(72, qodn.secondaryAttrOffset.halign),
        dxfPair(11, cadCoord(cadPoint.x + qodn.secondaryAttrOffset.alignX * scale)),
        dxfPair(21, cadCoord(cadPoint.y + qodn.secondaryAttrOffset.alignY * scale)),
        dxfPair(31, cadCoord(cadPoint.z)),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(280, 0),
        dxfPair(2, qodn.secondaryAttrTag),
        dxfPair(70, 0),
        dxfPair(280, 0),
      ].join("\n"),
    );
  }

  entities.push(
    [
      dxfPair(0, "SEQEND"),
      dxfPair(5, dxfHandle()),
      dxfPair(100, "AcDbEntity"),
      dxfPair(8, qodn.layer),
    ].join("\n"),
  );

  return entities;
}
