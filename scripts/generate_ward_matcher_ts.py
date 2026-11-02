# -*- coding: utf-8 -*-
"""
Sinh file TypeScript `webapp/src/lib/vietnamWardsDatabase.ts` chứa cơ sở dữ liệu
3.321 Phường, Xã, Đặc khu mới (kèm 9.947 Phường, Xã, Thị trấn cũ trước sáp nhập)
và bộ máy đối chiếu tên Phường/Xã chuẩn + Cụm từ khu vực thống nhất khi khuyết tên Phường.
"""
import json
import os


def main():
    with open(os.path.join("data", "vietnam_wards_3321_2025.json"), "r", encoding="utf-8") as f:
        payload = json.load(f)

    compact_by_prov = {}
    for w in payload["wards"]:
        c34 = w["code34"]
        compact_by_prov.setdefault(c34, []).append([
            w["ward_code"],
            w["ward_name"],
            "|".join(w.get("old_units") or []),
        ])

    compact_json_str = json.dumps(compact_by_prov, ensure_ascii=False, separators=(",", ":"))

    ts_code = f'''// AUTO-GENERATED FROM data/vietnam_wards_3321_2025.json — DO NOT EDIT MANUALLY
// Cơ sở dữ liệu Toàn bộ 3.321 Phường, Xã, Đặc khu mới (NQ 202/2025/QH15 & QĐ 19/2025/QĐ-TTg)
// kèm 9.947 Phường, Xã, Thị trấn lịch sử trước sáp nhập và Cơ chế Cụm từ Khu vực Thống nhất.

export interface WardDatabaseMatchResult {{
  ward_name: string;
  canonical_ward_2025: string;
  ward_code_2025: string;
  is_official_ward: boolean;
  is_merged_from_old: boolean;
  fallback_cluster_type: string | null;
}}

/**
 * 6 Cụm từ Khu vực Thống nhất được sử dụng để thay thế khi bản tin BĐS
 * không ghi rõ tên Phường / Xã / Thị trấn trong cơ sở dữ liệu.
 */
export const UNIFIED_FALLBACK_WARD_LABELS = {{
  NEW_URBAN_AREA: "Khu đô thị mới",
  CENTRAL_CORE: "Khu trung tâm",
  EXISTING_RESIDENTIAL: "Khu dân cư hiện hữu",
  INDUSTRIAL_SATELLITE: "Khu công nghiệp & Đô thị vệ tinh",
  TOURISM_COASTAL: "Khu du lịch & Nghỉ dưỡng",
  SUBURBAN_EXPANDING: "Khu vực ven đô & Ngoại thành",
}} as const;

// Cấu trúc nén theo 34 Tỉnh/Thành: [ward_code_5_digits, ward_name_2025, old_units_pipe_separated]
export const VIETNAM_WARDS_RAW_DB: Record<string, Array<[string, string, string]>> = {compact_json_str};

const PROVINCE_CODE_TO_DB_KEYS: Record<string, string[]> = {{
  HN: ["HN"],
  HCM: ["HCM"],
  BD: ["HCM"],
  BRVT: ["HCM"],
  HP: ["HP"],
  DN: ["DN"],
  HUE: ["HUE"],
  HUE_QT: ["HUE", "QT"],
  CT: ["CT"],
  CT_DBSCL: ["CT", "AG", "DT", "VL", "CM"],
  BN: ["BN"],
  HY: ["HY"],
  DNA: ["DNAI"],
  DNAI: ["DNAI"],
  QN: ["QNI"],
  QNI: ["QNI"],
  KH: ["KH"],
  LD: ["LD"],
  NB: ["NB"],
  NB_HNA_ND: ["NB"],
  VP_PT: ["PTH"],
  PTH: ["PTH"],
  TN: ["TNG"],
  TNG: ["TNG"],
  AG: ["AG"],
  LA_TN: ["TNI"],
  TNI: ["TNI"],
  TH: ["TH"],
  NA: ["NA"],
  HT: ["HT"],
  TH_NA_HT: ["TH", "NA", "HT"],
  GL: ["GL"],
  DLK: ["DLK"],
  QNG: ["QNG"],
  GL_DL: ["GL", "DLK", "QNG"],
  QT: ["QT"],
  DT: ["DT"],
  VL: ["VL"],
  CM: ["CM"],
  LCA: ["LCA"],
  TQ: ["TQ"],
  LS: ["LS"],
  CB: ["CB"],
  SL: ["SL"],
  DB: ["DB"],
  LCH: ["LCH"],
}};

// Danh sách tên Quận/Huyện/TP/Tỉnh trùng tên với Phường mới 2025 — chỉ khớp nếu có tiền tố "Phường"/"Xã" tường minh
const DISTRICT_OR_PROVINCE_HOMONYMS = new Set([
  "hoàn kiếm", "ba đình", "đống đa", "hai bà trưng", "hoàng mai", "cầu giấy",
  "thanh xuân", "tây hồ", "long biên", "hà đông", "nam từ liêm", "bắc từ liêm",
  "đông anh", "gia lâm", "hoài đức", "thanh trì", "sóc sơn", "mê linh", "thạch thất",
  "quốc oai", "chương mỹ", "đan phượng", "phúc thọ", "thường tín", "phú xuyên",
  "ứng hòa", "mỹ đức", "ba vì", "sơn tây", "hà nội", "hồ chí minh", "sài gòn",
  "thủ đức", "bình thạnh", "gò vấp", "tân bình", "tân phú", "phú nhuận", "bình tân",
  "bình chánh", "nhà bè", "hóc môn", "củ chi", "cần giờ", "dĩ an", "thuận an",
  "thủ dầu một", "bến cát", "tân uyên", "bàu bàng", "bà rịa", "vũng tàu", "phú mỹ",
  "hải châu", "sơn trà", "ngũ hành sơn", "liên chiểu", "cẩm lệ", "thanh khê", "hòa vang",
  "hội an", "điện bàn", "tam kỳ", "hồng bàng", "ngô quyền", "lê chân", "hải an",
  "kiến an", "đồ sơn", "dương kinh", "thủy nguyên", "an dương", "hải dương", "chí linh",
  "từ sơn", "yên phong", "quế võ", "tiên du", "thuận thành", "gia bình", "lương tài",
  "bắc ninh", "bắc giang", "việt yên", "hạ long", "cẩm phả", "uông bí", "móng cái",
  "quảng yên", "đông triều", "nha trang", "cam ranh", "ninh hòa", "đà lạt", "bảo lộc",
  "phan thiết", "biên hòa", "long thành", "nhơn trạch", "trảng bom", "long khánh",
  "ninh kiều", "cái răng", "bình thủy", "ô môn", "thốt nốt",
  "trung tâm", "thống nhất", "hòa bình", "thanh bình", "quang trung", "nguyễn trãi",
  "lê lợi", "minh khai", "lê hồng phong", "trần hưng đạo", "điện biên", "tân tiến",
  "tân thành", "tân an", "tân lập", "tân hưng", "tân hòa", "tân phước", "phú mỹ",
]);

interface IndexedWardEntry {{
  matchedName: string;
  canonical2025Name: string;
  wardCode2025: string;
  isOldMerged: boolean;
  bareName: string;
}}

interface ProvinceWardLookupIndex {{
  byFullNormalized: Map<string, IndexedWardEntry>;
  byBareNormalized: Map<string, IndexedWardEntry>;
  multiWordBareEntries: IndexedWardEntry[];
}}

const _provinceIndexCache = new Map<string, ProvinceWardLookupIndex>();

function normalizeViText(s: string): string {{
  return (s || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/\\s+/g, " ")
    .trim();
}}

function stripAdminPrefix(s: string): string {{
  return normalizeViText(s)
    .replace(/^(phường|p\\.|xã|x\\.|thị trấn|tt\\.|đặc khu)\\s+/i, "")
    .trim();
}}

function getProvinceLookupIndex(provinceCode: string): ProvinceWardLookupIndex {{
  const dbKeys = PROVINCE_CODE_TO_DB_KEYS[provinceCode] || ["HN"];
  const cacheKey = dbKeys.join("+");
  const cached = _provinceIndexCache.get(cacheKey);
  if (cached) return cached;

  const byFullNormalized = new Map<string, IndexedWardEntry>();
  const byBareNormalized = new Map<string, IndexedWardEntry>();
  const multiWordBareEntries: IndexedWardEntry[] = [];

  for (const c34 of dbKeys) {{
    const rows = VIETNAM_WARDS_RAW_DB[c34] || [];
    // 1. Index all 2025 official wards first
    for (const [wCode, wName2025, oldPipe] of rows) {{
      const fullNorm = normalizeViText(wName2025);
      const bareNorm = stripAdminPrefix(wName2025);
      const entry: IndexedWardEntry = {{
        matchedName: wName2025,
        canonical2025Name: wName2025,
        wardCode2025: wCode,
        isOldMerged: false,
        bareName: bareNorm,
      }};
      if (!byFullNormalized.has(fullNorm)) {{
        byFullNormalized.set(fullNorm, entry);
      }}
      if (bareNorm && !byBareNormalized.has(bareNorm)) {{
        byBareNormalized.set(bareNorm, entry);
        if (
          bareNorm.includes(" ") &&
          bareNorm.length >= 6 &&
          !DISTRICT_OR_PROVINCE_HOMONYMS.has(bareNorm)
        ) {{
          multiWordBareEntries.push(entry);
        }}
      }}
    }}

    // 2. Index all pre-merger historical wards/communes/townships (old_units)
    for (const [wCode, wName2025, oldPipe] of rows) {{
      if (!oldPipe) continue;
      const oldUnits = oldPipe.split("|");
      for (const rawOld of oldUnits) {{
        const oldClean = rawOld.replace(/\\s*\\(.*?\\)\\s*/g, "").trim();
        if (!oldClean) continue;
        const fullNorm = normalizeViText(oldClean);
        const bareNorm = stripAdminPrefix(oldClean);
        const sameName = normalizeViText(oldClean) === normalizeViText(wName2025);
        const displayWardName = sameName
          ? wName2025
          : `${{oldClean}}`;
        const entry: IndexedWardEntry = {{
          matchedName: displayWardName,
          canonical2025Name: wName2025,
          wardCode2025: wCode,
          isOldMerged: !sameName,
          bareName: bareNorm,
        }};
        if (!byFullNormalized.has(fullNorm)) {{
          byFullNormalized.set(fullNorm, entry);
        }}
        if (bareNorm && !byBareNormalized.has(bareNorm)) {{
          byBareNormalized.set(bareNorm, entry);
          if (
            bareNorm.includes(" ") &&
            bareNorm.length >= 6 &&
            !DISTRICT_OR_PROVINCE_HOMONYMS.has(bareNorm)
          ) {{
            multiWordBareEntries.push(entry);
          }}
        }}
      }}
    }}
  }}

  // Sort multi-word bare entries by length desc so longer specific names match first (e.g. "dịch vọng hậu" before "dịch vọng")
  multiWordBareEntries.sort((a, b) => b.bareName.length - a.bareName.length);

  const built: ProvinceWardLookupIndex = {{
    byFullNormalized,
    byBareNormalized,
    multiWordBareEntries,
  }};
  _provinceIndexCache.set(cacheKey, built);
  return built;
}}

/**
 * Xác định Cụm từ Khu vực Thống nhất khi bản tin không có tên Phường/Xã cụ thể.
 */
export function resolveUnifiedFallbackWardLabel(
  combinedGeoText: string,
  title: string,
  desc: string,
  pillarCode: string,
  districtName: string
): WardDatabaseMatchResult {{
  const allText = `${{combinedGeoText}} ${{title}} ${{desc}}`.toLowerCase();

  // 1. Khu đô thị mới (Dự án KĐT, Vinhomes, Ocean Park, Smart City, Ecopark, Phú Mỹ Hưng, Chung cư mới...)
  if (
    /\\b(khu đô thị|kđt|đô thị mới|vinhomes|ocean park|smart city|ecopark|ciputra|phú mỹ hưng|thủ thiêm|sala|aqua city|waterpoint|gamuda|splendora|geleximco|park city|times city|royal city|masteri|lumiere|sun grand|sun urban|mizuki|celadon|vạn phúc city)\\b/i.test(
      allText
    ) ||
    pillarCode === "RES-01"
  ) {{
    return {{
      ward_name: UNIFIED_FALLBACK_WARD_LABELS.NEW_URBAN_AREA,
      canonical_ward_2025: UNIFIED_FALLBACK_WARD_LABELS.NEW_URBAN_AREA,
      ward_code_2025: "CLUSTER_KDT_MOI",
      is_official_ward: false,
      is_merged_from_old: false,
      fallback_cluster_type: "NEW_URBAN_AREA",
    }};
  }}

  // 2. Khu công nghiệp & Đô thị vệ tinh
  if (
    /\\b(khu công nghiệp|kcn|vsip|khu chế xuất|khu công nghệ cao|nhà xưởng|kho bãi|cụm công nghiệp|samsung|foxconn)\\b/i.test(
      allText
    )
  ) {{
    return {{
      ward_name: UNIFIED_FALLBACK_WARD_LABELS.INDUSTRIAL_SATELLITE,
      canonical_ward_2025: UNIFIED_FALLBACK_WARD_LABELS.INDUSTRIAL_SATELLITE,
      ward_code_2025: "CLUSTER_KCN_VETINH",
      is_official_ward: false,
      is_merged_from_old: false,
      fallback_cluster_type: "INDUSTRIAL_SATELLITE",
    }};
  }}

  // 3. Khu du lịch & Nghỉ dưỡng
  if (
    /\\b(du lịch|nghỉ dưỡng|resort|condotel|biệt thự biển|mặt biển|ven biển|bãi biển|view biển|vịnh|đảo)\\b/i.test(
      allText
    )
  ) {{
    return {{
      ward_name: UNIFIED_FALLBACK_WARD_LABELS.TOURISM_COASTAL,
      canonical_ward_2025: UNIFIED_FALLBACK_WARD_LABELS.TOURISM_COASTAL,
      ward_code_2025: "CLUSTER_DULICH",
      is_official_ward: false,
      is_merged_from_old: false,
      fallback_cluster_type: "TOURISM_COASTAL",
    }};
  }}

  // 4. Khu trung tâm (Mặt phố thương mại, Quận lõi nội đô, CBD)
  if (
    pillarCode === "COM-03" ||
    /\\b(trung tâm|mặt phố|phố cổ|mặt tiền phố|lõi đô thị|cbd|ngã tư|trục chính|kinh doanh sầm uất)\\b/i.test(
      allText
    ) ||
    /^Quận\\s+/i.test(districtName)
  ) {{
    return {{
      ward_name: UNIFIED_FALLBACK_WARD_LABELS.CENTRAL_CORE,
      canonical_ward_2025: UNIFIED_FALLBACK_WARD_LABELS.CENTRAL_CORE,
      ward_code_2025: "CLUSTER_TRUNG_TAM",
      is_official_ward: false,
      is_merged_from_old: false,
      fallback_cluster_type: "CENTRAL_CORE",
    }};
  }}

  // 5. Khu vực ven đô & Ngoại thành (Đất nền, Huyện ngoại thành)
  if (
    pillarCode === "IND-04" ||
    /^Huyện\\s+/i.test(districtName) ||
    /\\b(ven đô|ngoại thành|đất nền|đất vườn|đất thổ cư|phân lô)\\b/i.test(allText)
  ) {{
    return {{
      ward_name: UNIFIED_FALLBACK_WARD_LABELS.SUBURBAN_EXPANDING,
      canonical_ward_2025: UNIFIED_FALLBACK_WARD_LABELS.SUBURBAN_EXPANDING,
      ward_code_2025: "CLUSTER_VEN_DO",
      is_official_ward: false,
      is_merged_from_old: false,
      fallback_cluster_type: "SUBURBAN_EXPANDING",
    }};
  }}

  // 6. Mặc định: Khu dân cư hiện hữu
  return {{
    ward_name: UNIFIED_FALLBACK_WARD_LABELS.EXISTING_RESIDENTIAL,
    canonical_ward_2025: UNIFIED_FALLBACK_WARD_LABELS.EXISTING_RESIDENTIAL,
    ward_code_2025: "CLUSTER_DAN_CU",
    is_official_ward: false,
    is_merged_from_old: false,
    fallback_cluster_type: "EXISTING_RESIDENTIAL",
  }};
}}

/**
 * Đối chiếu và phân tách tên Phường/Xã của bản tin BĐS dựa trên Database 3.321 Phường/Xã/Đặc khu mới
 * và 9.947 Phường/Xã/Thị trấn cũ. Nếu không tìm thấy tên Phường/Xã trong Database, trả về
 * Cụm từ Khu vực Thống nhất ("Khu trung tâm", "Khu đô thị mới", "Khu dân cư hiện hữu"...).
 */
export function matchWardFromDatabase(params: {{
  provinceCode: string;
  addrSnippet: string;
  searchCity: string;
  cluster: string;
  title: string;
  desc: string;
  pillarCode: string;
  districtName: string;
}}): WardDatabaseMatchResult {{
  const {{
    provinceCode,
    addrSnippet,
    searchCity,
    cluster,
    title,
    desc,
    pillarCode,
    districtName,
  }} = params;

  const index = getProvinceLookupIndex(provinceCode);

  // BƯỚC 1: Tìm các cụm có tiền tố hành chính tường minh ("Phường ...", "P. ...", "Xã ...", "Thị trấn ...", "Đặc khu ...")
  // và kiểm tra trực tiếp trong Database Phường/Xã của Tỉnh đó
  const prefixRegex =
    /\\b(Phường|P\\.|Xã|Thị trấn|TT\\.|Đặc khu)\\s*([0-9]{{1,2}}|[A-ZÀ-Ỹa-zà-ỹ0-9]+(?:\\s+[A-ZÀ-Ỹa-zà-ỹ0-9]+){{0,3}})/gi;

  for (const src of [addrSnippet, searchCity, cluster, title, desc]) {{
    if (!src) continue;
    let m: RegExpExecArray | null;
    prefixRegex.lastIndex = 0;
    while ((m = prefixRegex.exec(src)) !== null) {{
      const rawPrefix = m[1].toLowerCase();
      const normPrefix =
        rawPrefix === "p."
          ? "phường"
          : rawPrefix === "tt."
          ? "thị trấn"
          : rawPrefix;
      const words = m[2].trim().split(/\\s+/);
      // Thử từ 4 từ giảm dần xuống 1 từ để khớp chính xác tên Phường/Xã trong Database
      for (let len = Math.min(words.length, 4); len >= 1; len--) {{
        const tail = normalizeViText(words.slice(0, len).join(" "));
        const fullCand = `${{normPrefix}} ${{tail}}`;
        const hitFull = index.byFullNormalized.get(fullCand);
        if (hitFull) {{
          return {{
            ward_name: hitFull.matchedName,
            canonical_ward_2025: hitFull.canonical2025Name,
            ward_code_2025: hitFull.wardCode2025,
            is_official_ward: true,
            is_merged_from_old: hitFull.isOldMerged,
            fallback_cluster_type: null,
          }};
        }}
        const hitBare = index.byBareNormalized.get(tail);
        if (hitBare) {{
          return {{
            ward_name: hitBare.matchedName,
            canonical_ward_2025: hitBare.canonical2025Name,
            ward_code_2025: hitBare.wardCode2025,
            is_official_ward: true,
            is_merged_from_old: hitBare.isOldMerged,
            fallback_cluster_type: null,
          }};
        }}
      }}
    }}
  }}

  // BƯỚC 2: Tách các thành phần ngăn cách bởi dấu phẩy trong Địa chỉ / Khu vực (addrSnippet, searchCity, cluster)
  // và đối chiếu từng phần với Database Phường/Xã của Tỉnh (bỏ qua các phần bắt đầu bằng Quận/Huyện/Tỉnh/TP)
  for (const src of [addrSnippet, searchCity, cluster]) {{
    if (!src) continue;
    const segments = src.split(/[,|•;-]/).map((s) => s.trim()).filter(Boolean);
    for (const seg of segments) {{
      const normSeg = normalizeViText(seg);
      if (
        /^(quận|huyện|thị xã|tx\\.|thành phố|tp\\.|tỉnh|địa chỉ|khu vực)\\b/i.test(
          normSeg
        )
      ) {{
        continue;
      }}
      const hitFull = index.byFullNormalized.get(normSeg);
      if (hitFull) {{
        return {{
          ward_name: hitFull.matchedName,
          canonical_ward_2025: hitFull.canonical2025Name,
          ward_code_2025: hitFull.wardCode2025,
          is_official_ward: true,
          is_merged_from_old: hitFull.isOldMerged,
          fallback_cluster_type: null,
        }};
      }}
      if (!DISTRICT_OR_PROVINCE_HOMONYMS.has(normSeg)) {{
        const hitBare = index.byBareNormalized.get(normSeg);
        if (hitBare) {{
          return {{
            ward_name: hitBare.matchedName,
            canonical_ward_2025: hitBare.canonical2025Name,
            ward_code_2025: hitBare.wardCode2025,
            is_official_ward: true,
            is_merged_from_old: hitBare.isOldMerged,
            fallback_cluster_type: null,
          }};
        }}
      }}
    }}
  }}

  // BƯỚC 3: Quét tên riêng Phường/Xã đa âm tiết (>= 2 từ, không trùng tên Quận/Huyện) trong Địa chỉ & Tiêu đề
  const geoScanText = ` ${{normalizeViText(addrSnippet)}} | ${{normalizeViText(
    searchCity
  )}} | ${{normalizeViText(title)}} `;
  for (const entry of index.multiWordBareEntries) {{
    if (geoScanText.includes(` ${{entry.bareName}} `) || geoScanText.includes(` ${{entry.bareName}},`)) {{
      return {{
        ward_name: entry.matchedName,
        canonical_ward_2025: entry.canonical2025Name,
        ward_code_2025: entry.wardCode2025,
        is_official_ward: true,
        is_merged_from_old: entry.isOldMerged,
        fallback_cluster_type: null,
      }};
    }}
  }}

  // BƯỚC 4: Không có tên Phường/Xã trong Database -> Sử dụng Cụm từ Khu vực Thống nhất ("Khu trung tâm", "Khu đô thị mới"...)
  const combinedGeoText = [searchCity, addrSnippet, cluster, title]
    .filter(Boolean)
    .join(" | ");
  return resolveUnifiedFallbackWardLabel(
    combinedGeoText,
    title,
    desc,
    pillarCode,
    districtName
  );
}}
'''

    out_path = os.path.join("webapp", "src", "lib", "vietnamWardsDatabase.ts")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(ts_code)
    print(f"Generated {out_path} ({round(os.path.getsize(out_path)/1024, 1)} KB)")


if __name__ == "__main__":
    main()
