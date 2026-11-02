"use client";

import React, { useEffect, useMemo, useState } from "react";

interface WardValuationResponse {
  dual_address_resolution: {
    province_34_code: string;
    province_34_name: string;
    legacy_province_63: string;
    city_code: string;
    district_cluster: string | null;
    ward_code: string;
    ward_name: string;
    economic_zone_type: string;
    economic_zone_name_vi: string;
    macro_region: string;
  };
  empirical_bayes_shrinkage: {
    observed_ward_samples_n: number;
    prior_strength_kappa: number;
    shrinkage_weight_omega: number;
    parent_prior_unit_price_m2: number;
    observed_ward_mean_m2: number;
    eb_ward_baseline_m2: number;
    economic_zone_multiplier: number;
    hedonic_micro_multiplier: number;
  };
  valuation_result: {
    unit_price_p10_million_m2: number;
    unit_price_p25_million_m2: number;
    unit_price_p50_million_m2: number;
    unit_price_p75_million_m2: number;
    unit_price_p90_million_m2: number;
    area_m2: number;
    total_price_p10_billion_vnd: number;
    total_price_p50_billion_vnd: number;
    total_price_p90_billion_vnd: number;
    confidence_tier: string;
  };
}

interface PortalAuditItem {
  portal_id: string;
  portal_name: string;
  domain: string;
  tier: string;
  market_share_pct: number;
  estimated_daily_new_listings: number;
  technical_architecture: {
    rendering: string;
    anti_bot: string;
    recommended_engine: string;
  };
  historical_coverage_2021_2026: {
    wayback_cdx_density: string;
    sitemap_xml_archive: string;
    deep_pagination_max_pages: number;
  };
  runtime_health: string;
  efficiency_score: number;
  execution_priority: string;
}

interface Province34Entry {
  code34: string;
  name34: string;
  region: "NORTH" | "CENTRAL" | "SOUTH";
  regionLabel: string;
  legacy63List: string[];
  defaultBasePriceM2: number;
}

interface WardCatalogEntry {
  code: string;
  wardName: string;
  districtLegacy: string;
  legacy63: string;
  code34: string;
  zoneCode: string;
  basePriceM2: number;
  sampleDescription: string;
}

export const ECONOMIC_ZONES_CATALOG: Record<
  string,
  { code: string; shortName: string; fullName: string; multiplier: number; badgeClass: string }
> = {
  ZONE_CBD_URBAN_CORE: {
    code: "ZONE_CBD_URBAN_CORE",
    shortName: "Lõi Trung tâm CBD",
    fullName: "Khu Lõi Trung tâm Hành chính - Tài chính - Thương mại (CBD)",
    multiplier: 1.35,
    badgeClass: "badge-blue",
  },
  ZONE_TOURISM_RESORT_COASTAL: {
    code: "ZONE_TOURISM_RESORT_COASTAL",
    shortName: "Du lịch Biển & Nghỉ dưỡng",
    fullName: "Đặc khu Du lịch Biển, Đảo & Nghỉ dưỡng Sinh thái",
    multiplier: 1.22,
    badgeClass: "badge-green",
  },
  ZONE_HITECH_UNIVERSITY_TOD: {
    code: "ZONE_HITECH_UNIVERSITY_TOD",
    shortName: "Khu CNC, Đô thị ĐH & Metro TOD",
    fullName: "Khu Công nghệ cao, Đô thị Đại học, Đầu mối Metro TOD & Sân bay",
    multiplier: 1.2,
    badgeClass: "badge-blue",
  },
  ZONE_CRAFT_VILLAGE_HERITAGE: {
    code: "ZONE_CRAFT_VILLAGE_HERITAGE",
    shortName: "Làng nghề Truyền thống",
    fullName: "Khu Làng nghề Truyền thống & Thương mại Gia tộc",
    multiplier: 1.18,
    badgeClass: "badge-amber",
  },
  ZONE_INDUSTRIAL_FDI_PARK: {
    code: "ZONE_INDUSTRIAL_FDI_PARK",
    shortName: "Đô thị Khu Công nghiệp FDI",
    fullName: "Đô thị Khu Công nghiệp FDI & Khu Chế xuất",
    multiplier: 1.12,
    badgeClass: "badge-green",
  },
  ZONE_SUBURBAN_RESIDENTIAL_AGRI: {
    code: "ZONE_SUBURBAN_RESIDENTIAL_AGRI",
    shortName: "Khu Dân cư Mở rộng & Ven đô",
    fullName: "Khu Dân cư Mở rộng, Ven đô & Nông thôn Mới",
    multiplier: 0.9,
    badgeClass: "badge-amber",
  },
};

export const PROVINCES_34_CATALOG: Province34Entry[] = [
  { code34: "HN", name34: "TP. Hà Nội (Thủ đô)", region: "NORTH", regionLabel: "Miền Bắc", legacy63List: ["Hà Nội"], defaultBasePriceM2: 115 },
  { code34: "HCM", name34: "TP. Hồ Chí Minh (TP.HCM + Bình Dương + Bà Rịa - Vũng Tàu)", region: "SOUTH", regionLabel: "Miền Nam", legacy63List: ["TP. Hồ Chí Minh", "Bình Dương", "Bà Rịa - Vũng Tàu"], defaultBasePriceM2: 120 },
  { code34: "HP", name34: "TP. Hải Phòng (Hải Phòng + Hải Dương)", region: "NORTH", regionLabel: "Miền Bắc", legacy63List: ["Hải Phòng", "Hải Dương"], defaultBasePriceM2: 62 },
  { code34: "DN", name34: "TP. Đà Nẵng (Đà Nẵng + Quảng Nam)", region: "CENTRAL", regionLabel: "Miền Trung", legacy63List: ["Đà Nẵng", "Quảng Nam"], defaultBasePriceM2: 72 },
  { code34: "HUE", name34: "TP. Huế (Thừa Thiên Huế)", region: "CENTRAL", regionLabel: "Miền Trung", legacy63List: ["Thừa Thiên Huế"], defaultBasePriceM2: 48 },
  { code34: "CT", name34: "TP. Cần Thơ (Cần Thơ + Sóc Trăng + Hậu Giang)", region: "SOUTH", regionLabel: "Miền Nam", legacy63List: ["Cần Thơ", "Sóc Trăng", "Hậu Giang"], defaultBasePriceM2: 46 },
  { code34: "BN", name34: "Tỉnh Bắc Ninh (Bắc Ninh + Bắc Giang)", region: "NORTH", regionLabel: "Miền Bắc", legacy63List: ["Bắc Ninh", "Bắc Giang"], defaultBasePriceM2: 56 },
  { code34: "HY", name34: "Tỉnh Hưng Yên (Hưng Yên + Thái Bình)", region: "NORTH", regionLabel: "Miền Bắc", legacy63List: ["Hưng Yên", "Thái Bình"], defaultBasePriceM2: 64 },
  { code34: "DNAI", name34: "Tỉnh Đồng Nai (Đồng Nai + Bình Phước)", region: "SOUTH", regionLabel: "Miền Nam", legacy63List: ["Đồng Nai", "Bình Phước"], defaultBasePriceM2: 48 },
  { code34: "QNI", name34: "Tỉnh Quảng Ninh", region: "NORTH", regionLabel: "Miền Bắc", legacy63List: ["Quảng Ninh"], defaultBasePriceM2: 58 },
  { code34: "KH", name34: "Tỉnh Khánh Hòa (Khánh Hòa + Ninh Thuận)", region: "CENTRAL", regionLabel: "Miền Trung", legacy63List: ["Khánh Hòa", "Ninh Thuận"], defaultBasePriceM2: 68 },
  { code34: "LD", name34: "Tỉnh Lâm Đồng (Lâm Đồng + Bình Thuận + Đắk Nông)", region: "CENTRAL", regionLabel: "Miền Trung", legacy63List: ["Lâm Đồng", "Bình Thuận", "Đắk Nông"], defaultBasePriceM2: 55 },
  { code34: "NB", name34: "Tỉnh Ninh Bình (Ninh Bình + Hà Nam + Nam Định)", region: "NORTH", regionLabel: "Miền Bắc", legacy63List: ["Ninh Bình", "Hà Nam", "Nam Định"], defaultBasePriceM2: 42 },
  { code34: "PTH", name34: "Tỉnh Phú Thọ (Phú Thọ + Vĩnh Phúc + Hòa Bình)", region: "NORTH", regionLabel: "Miền Bắc", legacy63List: ["Vĩnh Phúc", "Phú Thọ", "Hòa Bình"], defaultBasePriceM2: 38 },
  { code34: "TNG", name34: "Tỉnh Thái Nguyên (Thái Nguyên + Bắc Kạn)", region: "NORTH", regionLabel: "Miền Bắc", legacy63List: ["Thái Nguyên", "Bắc Kạn"], defaultBasePriceM2: 35 },
  { code34: "AG", name34: "Tỉnh An Giang (Kiên Giang Phú Quốc + An Giang)", region: "SOUTH", regionLabel: "Miền Nam", legacy63List: ["Kiên Giang", "An Giang"], defaultBasePriceM2: 52 },
  { code34: "TNI", name34: "Tỉnh Tây Ninh (Long An + Tây Ninh)", region: "SOUTH", regionLabel: "Miền Nam", legacy63List: ["Long An", "Tây Ninh"], defaultBasePriceM2: 38 },
  { code34: "TH", name34: "Tỉnh Thanh Hóa", region: "CENTRAL", regionLabel: "Miền Trung", legacy63List: ["Thanh Hóa"], defaultBasePriceM2: 42 },
  { code34: "NA", name34: "Tỉnh Nghệ An", region: "CENTRAL", regionLabel: "Miền Trung", legacy63List: ["Nghệ An"], defaultBasePriceM2: 40 },
  { code34: "GL", name34: "Tỉnh Gia Lai (Bình Định + Gia Lai)", region: "CENTRAL", regionLabel: "Miền Trung", legacy63List: ["Bình Định", "Gia Lai"], defaultBasePriceM2: 44 },
  { code34: "DLK", name34: "Tỉnh Đắk Lắk (Phú Yên + Đắk Lắk)", region: "CENTRAL", regionLabel: "Miền Trung", legacy63List: ["Đắk Lắk", "Phú Yên"], defaultBasePriceM2: 38 },
  { code34: "QT", name34: "Tỉnh Quảng Trị (Quảng Bình + Quảng Trị)", region: "CENTRAL", regionLabel: "Miền Trung", legacy63List: ["Quảng Bình", "Quảng Trị"], defaultBasePriceM2: 35 },
  { code34: "QNG", name34: "Tỉnh Quảng Ngãi (Quảng Ngãi + Kon Tum)", region: "CENTRAL", regionLabel: "Miền Trung", legacy63List: ["Quảng Ngãi", "Kon Tum"], defaultBasePriceM2: 34 },
  { code34: "DT", name34: "Tỉnh Đồng Tháp (Tiền Giang + Đồng Tháp)", region: "SOUTH", regionLabel: "Miền Nam", legacy63List: ["Tiền Giang", "Đồng Tháp"], defaultBasePriceM2: 34 },
  { code34: "VL", name34: "Tỉnh Vĩnh Long (Vĩnh Long + Bến Tre + Trà Vinh)", region: "SOUTH", regionLabel: "Miền Nam", legacy63List: ["Vĩnh Long", "Bến Tre", "Trà Vinh"], defaultBasePriceM2: 32 },
  { code34: "CM", name34: "Tỉnh Cà Mau (Bạc Liêu + Cà Mau)", region: "SOUTH", regionLabel: "Miền Nam", legacy63List: ["Cà Mau", "Bạc Liêu"], defaultBasePriceM2: 28 },
  { code34: "HT", name34: "Tỉnh Hà Tĩnh", region: "CENTRAL", regionLabel: "Miền Trung", legacy63List: ["Hà Tĩnh"], defaultBasePriceM2: 32 },
  { code34: "LCA", name34: "Tỉnh Lào Cai (Lào Cai + Yên Bái)", region: "NORTH", regionLabel: "Miền Bắc", legacy63List: ["Lào Cai", "Yên Bái"], defaultBasePriceM2: 36 },
  { code34: "TQ", name34: "Tỉnh Tuyên Quang (Tuyên Quang + Hà Giang)", region: "NORTH", regionLabel: "Miền Bắc", legacy63List: ["Tuyên Quang", "Hà Giang"], defaultBasePriceM2: 28 },
  { code34: "LS", name34: "Tỉnh Lạng Sơn", region: "NORTH", regionLabel: "Miền Bắc", legacy63List: ["Lạng Sơn"], defaultBasePriceM2: 30 },
  { code34: "CB", name34: "Tỉnh Cao Bằng", region: "NORTH", regionLabel: "Miền Bắc", legacy63List: ["Cao Bằng"], defaultBasePriceM2: 26 },
  { code34: "SL", name34: "Tỉnh Sơn La", region: "NORTH", regionLabel: "Miền Bắc", legacy63List: ["Sơn La"], defaultBasePriceM2: 28 },
  { code34: "DB", name34: "Tỉnh Điện Biên", region: "NORTH", regionLabel: "Miền Bắc", legacy63List: ["Điện Biên"], defaultBasePriceM2: 26 },
  { code34: "LCH", name34: "Tỉnh Lai Châu", region: "NORTH", regionLabel: "Miền Bắc", legacy63List: ["Lai Châu"], defaultBasePriceM2: 24 },
];

export const WARD_CATALOG: WardCatalogEntry[] = [
  // HÀ NỘI (HN)
  { code: "HN_P_HANG_BAI", wardName: "Phường Hàng Bài", districtLegacy: "Quận Hoàn Kiếm", legacy63: "Hà Nội", code34: "HN", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 480, sampleDescription: "Nhà mặt phố trung tâm Hoàn Kiếm, lõi di sản thương mại tài chính" },
  { code: "HN_P_QUANG_AN", wardName: "Phường Quảng An", districtLegacy: "Quận Tây Hồ", legacy63: "Hà Nội", code34: "HN", zoneCode: "ZONE_TOURISM_RESORT_COASTAL", basePriceM2: 265, sampleDescription: "Biệt thự / căn hộ ven Hồ Tây, khu ngoại giao đoàn và chuyên gia quốc tế" },
  { code: "HN_P_LANG_HA", wardName: "Phường Láng Hạ", districtLegacy: "Quận Đống Đa", legacy63: "Hà Nội", code34: "HN", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 195, sampleDescription: "Tuyến phố tài chính ngân hàng Láng Hạ - Thái Hà, ngõ ô tô tránh" },
  { code: "HN_P_TRUNG_HOA", wardName: "Phường Trung Hòa", districtLegacy: "Quận Cầu Giấy", legacy63: "Hà Nội", code34: "HN", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 172, sampleDescription: "Khu đô thị Trung Hòa - Nhân Chính, Trần Duy Hưng, văn phòng sầm uất" },
  { code: "HN_P_DICH_VONG_HAU", wardName: "Phường Dịch Vọng Hậu", districtLegacy: "Quận Cầu Giấy", legacy63: "Hà Nội", code34: "HN", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 165, sampleDescription: "Thủ phủ công nghệ Duy Tân - Xuân Thủy - Cầu Giấy, sát ga Metro" },
  { code: "HN_P_NHAN_CHINH", wardName: "Phường Nhân Chính", districtLegacy: "Quận Thanh Xuân", legacy63: "Hà Nội", code34: "HN", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 158, sampleDescription: "Trục Lê Văn Lương - Hoàng Đạo Thúy, nhà phân lô và chung cư cao cấp" },
  { code: "HN_P_MY_DINH_2", wardName: "Phường Mỹ Đình 2", districtLegacy: "Quận Nam Từ Liêm", legacy63: "Hà Nội", code34: "HN", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 135, sampleDescription: "Khu đô thị Mỹ Đình - Lê Đức Thọ - Hàm Nghi, hạ tầng đồng bộ" },
  { code: "HN_P_TAY_MO", wardName: "Phường Tây Mỗ (Vinhomes Smart City)", districtLegacy: "Quận Nam Từ Liêm", legacy63: "Hà Nội", code34: "HN", zoneCode: "ZONE_HITECH_UNIVERSITY_TOD", basePriceM2: 88, sampleDescription: "Đại đô thị thông minh phía Tây, nút giao Đại lộ Thăng Long & Metro" },
  { code: "HN_P_HOANG_LIET", wardName: "Phường Hoàng Liệt (Bán đảo Linh Đàm)", districtLegacy: "Quận Hoàng Mai", legacy63: "Hà Nội", code34: "HN", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 96, sampleDescription: "Khu đô thị Linh Đàm, Giải Phóng, Vành đai 3, mật độ giao dịch cao" },
  { code: "HN_P_VIET_HUNG", wardName: "Phường Việt Hưng (Vinhomes Riverside)", districtLegacy: "Quận Long Biên", legacy63: "Hà Nội", code34: "HN", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 142, sampleDescription: "Khu đô thị sinh thái Long Biên, hạ tầng quy hoạch thoáng rộng" },
  { code: "HN_P_VAN_PHUC", wardName: "Phường Vạn Phúc (Làng lụa Hà Đông)", districtLegacy: "Quận Hà Đông", legacy63: "Hà Nội", code34: "HN", zoneCode: "ZONE_CRAFT_VILLAGE_HERITAGE", basePriceM2: 118, sampleDescription: "Làng nghề lụa Vạn Phúc & trục Tố Hữu, vừa ở vừa kinh doanh" },
  { code: "HN_X_NINH_HIEP", wardName: "Xã Ninh Hiệp (Chợ đầu mối vải)", districtLegacy: "Huyện Gia Lâm", legacy63: "Hà Nội", code34: "HN", zoneCode: "ZONE_CRAFT_VILLAGE_HERITAGE", basePriceM2: 145, sampleDescription: "Thủ phủ thương mại dệt may Ninh Hiệp, dòng tiền cho thuê cửa hàng cực lớn" },
  { code: "HN_X_BAT_TRANG", wardName: "Xã Bát Tràng (Làng gốm & Eco)", districtLegacy: "Huyện Gia Lâm", legacy63: "Hà Nội", code34: "HN", zoneCode: "ZONE_CRAFT_VILLAGE_HERITAGE", basePriceM2: 78, sampleDescription: "Làng nghề gốm sứ di sản sát Vinhomes Ocean Park & sông Hồng" },
  { code: "HN_X_DONG_HOI", wardName: "Xã Đông Hội (Cầu Tứ Liên - Vinhomes Cổ Loa)", districtLegacy: "Huyện Đông Anh", legacy63: "Hà Nội", code34: "HN", zoneCode: "ZONE_HITECH_UNIVERSITY_TOD", basePriceM2: 112, sampleDescription: "Trung tâm triển lãm Quốc gia Cổ Loa & đầu cầu Tứ Liên kết nối Hồ Tây" },
  { code: "HN_X_HOA_LAC", wardName: "Xã Hòa Lạc (Khu Công nghệ cao)", districtLegacy: "Huyện Thạch Thất", legacy63: "Hà Nội", code34: "HN", zoneCode: "ZONE_HITECH_UNIVERSITY_TOD", basePriceM2: 48, sampleDescription: "Khu Công nghệ cao Hòa Lạc & Đại học Quốc gia Hà Nội, tuyến Metro số 5" },

  // TP. HỒ CHÍ MINH MỞ RỘNG (HCM + BÌNH DƯƠNG + BÀ RỊA - VŨNG TÀU)
  { code: "HCM_P_BEN_NGHE", wardName: "Phường Bến Nghé (Phố đi bộ Nguyễn Huệ)", districtLegacy: "Quận 1", legacy63: "TP. Hồ Chí Minh", code34: "HCM", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 450, sampleDescription: "Lõi trung tâm tài chính quốc tế Quận 1, mặt tiền Nguyễn Huệ - Lê Lợi" },
  { code: "HCM_P_THU_THIEM", wardName: "Phường Thủ Thiêm (KĐT Mới Thủ Thiêm)", districtLegacy: "TP. Thủ Đức (Quận 2 cũ)", legacy63: "TP. Hồ Chí Minh", code34: "HCM", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 245, sampleDescription: "Trung tâm tài chính mới Thủ Thiêm ven sông Sài Gòn, kết nối cầu Ba Son" },
  { code: "HCM_P_THAO_DIEN", wardName: "Phường Thảo Điền", districtLegacy: "TP. Thủ Đức (Quận 2 cũ)", legacy63: "TP. Hồ Chí Minh", code34: "HCM", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 185, sampleDescription: "Khu biệt thự & căn hộ hạng sang ven sông, ga Metro số 1 Bến Thành - Suối Tiên" },
  { code: "HCM_P_TAN_PHONG", wardName: "Phường Tân Phong (Phú Mỹ Hưng)", districtLegacy: "Quận 7", legacy63: "TP. Hồ Chí Minh", code34: "HCM", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 155, sampleDescription: "Khu đô thị kiểu mẫu Phú Mỹ Hưng Quận 7, thương mại quốc tế" },
  { code: "HCM_P_22_BINH_THANH", wardName: "Phường 22 (Vinhomes Central Park)", districtLegacy: "Quận Bình Thạnh", legacy63: "TP. Hồ Chí Minh", code34: "HCM", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 148, sampleDescription: "Tổ hợp Landmark 81 ven sông Sài Gòn, kết nối thẳng Quận 1" },
  { code: "HCM_P_VO_THI_SAU", wardName: "Phường Võ Thị Sáu", districtLegacy: "Quận 3", legacy63: "TP. Hồ Chí Minh", code34: "HCM", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 235, sampleDescription: "Khu biệt thự cổ & tòa nhà văn phòng trung tâm Quận 3" },
  { code: "HCM_P_LONG_BINH", wardName: "Phường Long Bình (Vinhomes Grand Park)", districtLegacy: "TP. Thủ Đức (Quận 9 cũ)", legacy63: "TP. Hồ Chí Minh", code34: "HCM", zoneCode: "ZONE_HITECH_UNIVERSITY_TOD", basePriceM2: 72, sampleDescription: "Khu Công nghệ cao TP. Thủ Đức, Bến xe Miền Đông mới & Vành đai 3" },
  { code: "BD_P_DI_AN", wardName: "Phường Dĩ An (Cụm KCN VSIP - Sóng Thần)", districtLegacy: "TP. Dĩ An", legacy63: "Bình Dương", code34: "HCM", zoneCode: "ZONE_INDUSTRIAL_FDI_PARK", basePriceM2: 46, sampleDescription: "Cửa ngõ kết nối TP. Thủ Đức & Làng Đại học Quốc gia, sát KCN Sóng Thần" },
  { code: "BD_P_BINH_HOA", wardName: "Phường Bình Hòa (KCN VSIP 1)", districtLegacy: "TP. Thuận An", legacy63: "Bình Dương", code34: "HCM", zoneCode: "ZONE_INDUSTRIAL_FDI_PARK", basePriceM2: 48, sampleDescription: "Trung tâm KCN VSIP 1 Thuận An, chuyên gia FDI sinh sống đông đúc" },
  { code: "BD_P_HOA_PHU", wardName: "Phường Hòa Phú (Thành phố Mới Bình Dương)", districtLegacy: "TP. Thủ Dầu Một", legacy63: "Bình Dương", code34: "HCM", zoneCode: "ZONE_INDUSTRIAL_FDI_PARK", basePriceM2: 52, sampleDescription: "Trung tâm Hành chính & WTC Thành phố Mới Bình Dương" },
  { code: "BRVT_P_THANG_TAM", wardName: "Phường Thắng Tam (Biển Bãi Sau)", districtLegacy: "TP. Vũng Tàu", legacy63: "Bà Rịa - Vũng Tàu", code34: "HCM", zoneCode: "ZONE_TOURISM_RESORT_COASTAL", basePriceM2: 95, sampleDescription: "Trục đường biển Thùy Vân - Bãi Sau Vũng Tàu, khách sạn & condotel du lịch" },
  { code: "BRVT_P_PHU_MY", wardName: "Phường Phú Mỹ (Cảng Quốc tế Cái Mép)", districtLegacy: "TX. Phú Mỹ", legacy63: "Bà Rịa - Vũng Tàu", code34: "HCM", zoneCode: "ZONE_INDUSTRIAL_FDI_PARK", basePriceM2: 38, sampleDescription: "Cụm cảng nước sâu Cái Mép - Thị Vải & KCN Phú Mỹ 1-2-3" },
  { code: "BRVT_X_PHUOC_THUAN", wardName: "Xã Phước Thuận (Biển Hồ Tràm)", districtLegacy: "Huyện Xuyên Mộc", legacy63: "Bà Rịa - Vũng Tàu", code34: "HCM", zoneCode: "ZONE_TOURISM_RESORT_COASTAL", basePriceM2: 62, sampleDescription: "Thủ phủ resort nghỉ dưỡng biển cao cấp Hồ Tràm - Bình Châu" },

  // BẮC NINH MỞ RỘNG (BẮC NINH + BẮC GIANG)
  { code: "BN_P_DONG_KY", wardName: "Phường Đồng Kỵ (Làng nghề Gỗ Mỹ nghệ)", districtLegacy: "TP. Từ Sơn", legacy63: "Bắc Ninh", code34: "BN", zoneCode: "ZONE_CRAFT_VILLAGE_HERITAGE", basePriceM2: 72, sampleDescription: "Làng nghề gỗ mỹ nghệ triệu đô Đồng Kỵ - Từ Sơn, mặt phố showroom sầm uất" },
  { code: "BN_P_SUOI_HOA", wardName: "Phường Suối Hoa", districtLegacy: "TP. Bắc Ninh", legacy63: "Bắc Ninh", code34: "BN", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 68, sampleDescription: "Trục Lý Thái Tổ trung tâm hành chính - thương mại TP. Bắc Ninh" },
  { code: "BN_P_VO_CUONG", wardName: "Phường Võ Cường", districtLegacy: "TP. Bắc Ninh", legacy63: "Bắc Ninh", code34: "BN", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 58, sampleDescription: "Khu đô thị mới Võ Cường, tập trung chuyên gia Hàn Quốc - Trung Quốc" },
  { code: "BN_TT_CHO_YEN_PHONG", wardName: "Thị trấn Chờ (Thủ phủ KCN Yên Phong Samsung)", districtLegacy: "Huyện Yên Phong", legacy63: "Bắc Ninh", code34: "BN", zoneCode: "ZONE_INDUSTRIAL_FDI_PARK", basePriceM2: 44, sampleDescription: "Sát tổ hợp Samsung Electronics Yên Phong, nhu cầu thuê và thương mại cao" },
  { code: "BG_P_NENH", wardName: "Phường Nếnh (KCN Quang Châu - Vân Trung)", districtLegacy: "TX. Việt Yên", legacy63: "Bắc Giang", code34: "BN", zoneCode: "ZONE_INDUSTRIAL_FDI_PARK", basePriceM2: 42, sampleDescription: "Thủ phủ công nghiệp Foxconn & Luxshare tại Việt Yên, Bắc Giang" },
  { code: "BG_P_DINH_KE", wardName: "Phường Dĩnh Kế", districtLegacy: "TP. Bắc Giang", legacy63: "Bắc Giang", code34: "BN", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 48, sampleDescription: "Khu đô thị trung tâm TP. Bắc Giang" },

  // HẢI PHÒNG MỞ RỘNG (HẢI PHÒNG + HẢI DƯƠNG)
  { code: "HP_P_MINH_KHAI", wardName: "Phường Minh Khai", districtLegacy: "Quận Hồng Bàng", legacy63: "Hải Phòng", code34: "HP", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 92, sampleDescription: "Lõi trung tâm phố cổ & hành chính Quận Hồng Bàng, Hải Phòng" },
  { code: "HP_P_DANG_GIANG", wardName: "Phường Đằng Giang (Trục Lê Hồng Phong)", districtLegacy: "Quận Ngô Quyền", legacy63: "Hải Phòng", code34: "HP", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 88, sampleDescription: "Trục đại lộ Lê Hồng Phong kết nối sân bay Cát Bi" },
  { code: "HP_P_THUY_DUONG", wardName: "Phường Thủy Đường (KĐT Bắc Sông Cấm & Vũ Yên)", districtLegacy: "TP. Thủy Nguyên", legacy63: "Hải Phòng", code34: "HP", zoneCode: "ZONE_INDUSTRIAL_FDI_PARK", basePriceM2: 64, sampleDescription: "Trung tâm Hành chính - Chính trị mới Bắc Sông Cấm, KCN VSIP Hải Phòng" },
  { code: "HP_TT_CAT_BA", wardName: "Thị trấn Cát Bà", districtLegacy: "Huyện Cát Hải", legacy63: "Hải Phòng", code34: "HP", zoneCode: "ZONE_TOURISM_RESORT_COASTAL", basePriceM2: 75, sampleDescription: "Đặc khu du lịch sinh thái biển đảo Cát Bà - Vịnh Lan Hạ" },
  { code: "HD_P_HAI_TAN", wardName: "Phường Hải Tân (KĐT Ecorivers)", districtLegacy: "TP. Hải Dương", legacy63: "Hải Dương", code34: "HP", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 45, sampleDescription: "Khu đô thị sinh thái phía Đông TP. Hải Dương" },

  // ĐÀ NẴNG MỞ RỘNG (ĐÀ NẴNG + QUẢNG NAM)
  { code: "DN_P_PHUOC_MY", wardName: "Phường Phước Mỹ (Biển Mỹ Khê)", districtLegacy: "Quận Sơn Trà", legacy63: "Đà Nẵng", code34: "DN", zoneCode: "ZONE_TOURISM_RESORT_COASTAL", basePriceM2: 125, sampleDescription: "Trục Võ Nguyên Giáp - Phạm Văn Đồng sát bãi biển Mỹ Khê Đà Nẵng" },
  { code: "DN_P_THACH_THANG", wardName: "Phường Thạch Thang (Bạch Đằng Sông Hàn)", districtLegacy: "Quận Hải Châu", legacy63: "Đà Nẵng", code34: "DN", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 118, sampleDescription: "Lõi trung tâm hành chính Quận Hải Châu ven sông Hàn" },
  { code: "DN_P_HOA_XUAN", wardName: "Phường Hòa Xuân (KĐT Sinh thái Hòa Xuân)", districtLegacy: "Quận Cẩm Lệ", legacy63: "Đà Nẵng", code34: "DN", zoneCode: "ZONE_SUBURBAN_RESIDENTIAL_AGRI", basePriceM2: 52, sampleDescription: "Khu đô thị sinh thái ven sông Cẩm Lệ - Hòa Xuân, quy hoạch phân lô đồng bộ" },
  { code: "QNA_P_CAM_AN", wardName: "Phường Cẩm An (Biển An Bàng - Hội An)", districtLegacy: "TP. Hội An", legacy63: "Quảng Nam", code34: "DN", zoneCode: "ZONE_TOURISM_RESORT_COASTAL", basePriceM2: 68, sampleDescription: "Trục nghỉ dưỡng ven biển Đà Nẵng - Hội An, villa du lịch quốc tế" },

  // HƯNG YÊN MỞ RỘNG (HƯNG YÊN + THÁI BÌNH)
  { code: "HY_X_XUAN_QUAN", wardName: "Xã Xuân Quan (Đại đô thị Ecopark)", districtLegacy: "Huyện Văn Giang", legacy63: "Hưng Yên", code34: "HY", zoneCode: "ZONE_TOURISM_RESORT_COASTAL", basePriceM2: 95, sampleDescription: "Đại đô thị sinh thái Ecopark Văn Giang giáp ranh Hà Nội" },
  { code: "HY_X_NGHIA_TRU", wardName: "Xã Nghĩa Trụ (Vinhomes Ocean Park 2-3)", districtLegacy: "Huyện Văn Giang", legacy63: "Hưng Yên", code34: "HY", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 105, sampleDescription: "Quần thể đô thị biển hồ Ocean City phía Đông Hà Nội, Vành đai 3.5" },
  { code: "TB_P_LE_HONG_PHONG", wardName: "Phường Lê Hồng Phong", districtLegacy: "TP. Thái Bình", legacy63: "Thái Bình", code34: "HY", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 42, sampleDescription: "Trung tâm thương mại sầm uất TP. Thái Bình" },

  // ĐỒNG NAI MỞ RỘNG (ĐỒNG NAI + BÌNH PHƯỚC)
  { code: "DNAI_TT_LONG_THANH", wardName: "Thị trấn Long Thành (Sân bay Quốc tế Long Thành)", districtLegacy: "Huyện Long Thành", legacy63: "Đồng Nai", code34: "DNAI", zoneCode: "ZONE_HITECH_UNIVERSITY_TOD", basePriceM2: 48, sampleDescription: "Đô thị sân bay Quốc tế Long Thành & cao tốc TP.HCM - Long Thành" },
  { code: "DNAI_P_THONG_NHAT", wardName: "Phường Thống Nhất", districtLegacy: "TP. Biên Hòa", legacy63: "Đồng Nai", code34: "DNAI", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 56, sampleDescription: "Trục Võ Thị Sáu trung tâm TP. Biên Hòa" },
  { code: "DNAI_X_LONG_HUNG", wardName: "Xã Long Hưng (Đại đô thị Aqua City)", districtLegacy: "TP. Biên Hòa", legacy63: "Đồng Nai", code34: "DNAI", zoneCode: "ZONE_TOURISM_RESORT_COASTAL", basePriceM2: 54, sampleDescription: "Khu đô thị sinh thái ven sông Đồng Nai kết nối Hương lộ 2" },
  { code: "BP_P_TAN_PHU", wardName: "Phường Tân Phú", districtLegacy: "TP. Đồng Xoài", legacy63: "Bình Phước", code34: "DNAI", zoneCode: "ZONE_INDUSTRIAL_FDI_PARK", basePriceM2: 24, sampleDescription: "Trung tâm hành chính TP. Đồng Xoài & cụm KCN Đồng Xoài" },

  // QUẢNG NINH, KHÁNH HÒA, LÂM ĐỒNG, CẦN THƠ, PHÚ QUỐC, CÁC TỈNH KHÁC
  { code: "QNI_P_BAI_CHAY", wardName: "Phường Bãi Cháy (Vịnh Di sản Hạ Long)", districtLegacy: "TP. Hạ Long", legacy63: "Quảng Ninh", code34: "QNI", zoneCode: "ZONE_TOURISM_RESORT_COASTAL", basePriceM2: 78, sampleDescription: "Trung tâm du lịch biển Bãi Cháy - Sun World Hạ Long" },
  { code: "QNI_P_HONG_HAI", wardName: "Phường Hồng Hải (Cột 3 - Cột 8 Hòn Gai)", districtLegacy: "TP. Hạ Long", legacy63: "Quảng Ninh", code34: "QNI", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 85, sampleDescription: "Trung tâm hành chính - đô thị ven biển Hòn Gai, Quảng Ninh" },
  { code: "KH_P_LOC_THO", wardName: "Phường Lộc Thọ (Đường Trần Phú Nha Trang)", districtLegacy: "TP. Nha Trang", legacy63: "Khánh Hòa", code34: "KH", zoneCode: "ZONE_TOURISM_RESORT_COASTAL", basePriceM2: 135, sampleDescription: "Tuyến đường mặt biển Trần Phú trung tâm TP. Nha Trang" },
  { code: "NT_P_MY_BINH", wardName: "Phường Mỹ Bình (Biển Bình Sơn - Ninh Chữ)", districtLegacy: "TP. Phan Rang - Tháp Chàm", legacy63: "Ninh Thuận", code34: "KH", zoneCode: "ZONE_TOURISM_RESORT_COASTAL", basePriceM2: 42, sampleDescription: "Khu đô thị biển Bình Sơn - Ninh Chữ" },
  { code: "LD_P_1_DA_LAT", wardName: "Phường 1 (Khu Hòa Bình - Hồ Xuân Hương)", districtLegacy: "TP. Đà Lạt", legacy63: "Lâm Đồng", code34: "LD", zoneCode: "ZONE_TOURISM_RESORT_COASTAL", basePriceM2: 145, sampleDescription: "Lõi trung tâm du lịch nghỉ dưỡng cao nguyên Đà Lạt" },
  { code: "BTH_P_MUI_NE", wardName: "Phường Mũi Né (Thủ phủ Resort Phan Thiết)", districtLegacy: "TP. Phan Thiết", legacy63: "Bình Thuận", code34: "LD", zoneCode: "ZONE_TOURISM_RESORT_COASTAL", basePriceM2: 58, sampleDescription: "Trục nghỉ dưỡng biển Huỳnh Thúc Kháng - Nguyễn Đình Chiểu, Mũi Né" },
  { code: "CT_P_TAN_AN", wardName: "Phường Tân An (Bến Ninh Kiều)", districtLegacy: "Quận Ninh Kiều", legacy63: "Cần Thơ", code34: "CT", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 65, sampleDescription: "Lõi trung tâm thương mại Bến Ninh Kiều, TP. Cần Thơ" },
  { code: "NB_X_NINH_HAI", wardName: "Xã Ninh Hải (Tam Cốc - Tràng An)", districtLegacy: "TP. Hoa Lư", legacy63: "Ninh Bình", code34: "NB", zoneCode: "ZONE_TOURISM_RESORT_COASTAL", basePriceM2: 48, sampleDescription: "Quần thể di sản thế giới Tràng An - Tam Cốc, homestay & resort sinh thái" },
  { code: "HNA_P_DUY_TIEN", wardName: "Phường Hòa Mạc (KCN Đồng Văn 1-4)", districtLegacy: "TX. Duy Tiên", legacy63: "Hà Nam", code34: "NB", zoneCode: "ZONE_INDUSTRIAL_FDI_PARK", basePriceM2: 36, sampleDescription: "Cụm KCN Đồng Văn kết nối cao tốc Pháp Vân - Cầu Giẽ" },
  { code: "VP_P_KHAI_QUANG", wardName: "Phường Khai Quang (KCN Khai Quang)", districtLegacy: "TP. Vĩnh Yên", legacy63: "Vĩnh Phúc", code34: "PTH", zoneCode: "ZONE_INDUSTRIAL_FDI_PARK", basePriceM2: 38, sampleDescription: "Trung tâm công nghiệp & đô thị TP. Vĩnh Yên" },
  { code: "HB_X_NHUAN_TRACH", wardName: "Xã Nhuận Trạch (Nghỉ dưỡng Lương Sơn)", districtLegacy: "Huyện Lương Sơn", legacy63: "Hòa Bình", code34: "PTH", zoneCode: "ZONE_TOURISM_RESORT_COASTAL", basePriceM2: 22, sampleDescription: "Thủ phủ biệt thự nghỉ dưỡng ven đô Lương Sơn, Hòa Bình" },
  { code: "TNG_P_BA_HANG", wardName: "Phường Ba Hàng (KCN Yên Bình Samsung)", districtLegacy: "TP. Phổ Yên", legacy63: "Thái Nguyên", code34: "TNG", zoneCode: "ZONE_INDUSTRIAL_FDI_PARK", basePriceM2: 34, sampleDescription: "Tổ hợp Samsung Thái Nguyên tại TP. Phổ Yên" },
  { code: "KG_P_DUONG_DONG", wardName: "Phường Dương Đông (Trung tâm Đảo Phú Quốc)", districtLegacy: "TP. Phú Quốc", legacy63: "Kiên Giang", code34: "AG", zoneCode: "ZONE_TOURISM_RESORT_COASTAL", basePriceM2: 82, sampleDescription: "Trung tâm thương mại & du lịch biển đảo Phú Quốc" },
  { code: "LA_TT_BEN_LUC", wardName: "Thị trấn Bến Lức (KĐT Waterpoint)", districtLegacy: "Huyện Bến Lức", legacy63: "Long An", code34: "TNI", zoneCode: "ZONE_INDUSTRIAL_FDI_PARK", basePriceM2: 38, sampleDescription: "Đô thị vệ tinh cửa ngõ Tây Nam TP.HCM" },
  { code: "TH_P_SAM_SON", wardName: "Phường Bắc Sơn (Biển Sầm Sơn)", districtLegacy: "TP. Sầm Sơn", legacy63: "Thanh Hóa", code34: "TH", zoneCode: "ZONE_TOURISM_RESORT_COASTAL", basePriceM2: 55, sampleDescription: "Quảng trường biển & trục Hồ Xuân Hương Sầm Sơn" },
  { code: "NA_P_QUANG_TRUNG", wardName: "Phường Quang Trung", districtLegacy: "TP. Vinh", legacy63: "Nghệ An", code34: "NA", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 52, sampleDescription: "Lõi trung tâm thương mại TP. Vinh, Nghệ An" },
  { code: "HUE_P_VINH_NINH", wardName: "Phường Vĩnh Ninh (Bờ Nam Sông Hương)", districtLegacy: "Quận Thuận Hóa", legacy63: "Thừa Thiên Huế", code34: "HUE", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 58, sampleDescription: "Trung tâm hành chính - văn hóa bờ Nam sông Hương, TP. Huế" },
  { code: "BDI_P_QUY_NHON", wardName: "Phường Nguyễn Văn Cừ (Biển Quy Nhơn)", districtLegacy: "TP. Quy Nhơn", legacy63: "Bình Định", code34: "GL", zoneCode: "ZONE_TOURISM_RESORT_COASTAL", basePriceM2: 68, sampleDescription: "Trục đường biển An Dương Vương trung tâm TP. Quy Nhơn" },
  { code: "DLK_P_TAN_AN", wardName: "Phường Tân An (KĐT EcoCity Premia)", districtLegacy: "TP. Buôn Ma Thuột", legacy63: "Đắk Lắk", code34: "DLK", zoneCode: "ZONE_CBD_URBAN_CORE", basePriceM2: 38, sampleDescription: "Trung tâm đô thị mới cửa ngõ phía Bắc TP. Buôn Ma Thuột" },
  { code: "QB_P_HAI_THANH", wardName: "Phường Hải Thành (Bán đảo Bảo Ninh - Nhật Lệ)", districtLegacy: "TP. Đồng Hới", legacy63: "Quảng Bình", code34: "QT", zoneCode: "ZONE_TOURISM_RESORT_COASTAL", basePriceM2: 42, sampleDescription: "Tuyến du lịch biển Nhật Lệ - Bảo Ninh, TP. Đồng Hới" },
  { code: "LCA_P_SA_PA", wardName: "Phường Sa Pa (Thị xã Du lịch Sa Pa)", districtLegacy: "TX. Sa Pa", legacy63: "Lào Cai", code34: "LCA", zoneCode: "ZONE_TOURISM_RESORT_COASTAL", basePriceM2: 64, sampleDescription: "Trung tâm du lịch nghỉ dưỡng núi cao Sa Pa - Fansipan" },
];

export default function RealEstateWardAndPortalHub() {
  // Chế độ hiển thị bên trong khối: Định giá Phường/Xã | Bảng 34<->63 Tỉnh | Kiểm toán 6 Cổng BĐS
  const [hubSectionMode, setHubSectionMode] = useState<
    "WARD_VALUATION" | "PROVINCE_34_63_MAP" | "PORTAL_AUDIT"
  >("WARD_VALUATION");
  const [showMethodGuide, setShowMethodGuide] = useState<boolean>(true);

  // Chế độ chọn Phường/Xã: CATALOG (chọn từ 34/63 Tỉnh & 55+ Phường tiêu biểu) hoặc CUSTOM (tự nhập bất kỳ Phường/Xã nào trên toàn quốc)
  const [wardSelectMode, setWardSelectMode] = useState<"CATALOG" | "CUSTOM">("CATALOG");
  const [filterProvince34, setFilterProvince34] = useState<string>("ALL");
  const [filterZoneCode, setFilterZoneCode] = useState<string>("ALL");
  const [wardSearchQuery, setWardSearchQuery] = useState<string>("");
  const [selectedWardCode, setSelectedWardCode] = useState<string>("BN_P_DONG_KY");

  // Trạng thái khi người dùng chọn chế độ "Tự nhập bất kỳ Phường/Xã nào trên toàn quốc"
  const [customProvince34, setCustomProvince34] = useState<string>("HN");
  const [customLegacy63, setCustomLegacy63] = useState<string>("Hà Nội");
  const [customWardName, setCustomWardName] = useState<string>(
    "Phường Lĩnh Nam, Quận Hoàng Mai (Đường Tân Khai - Tam Trinh)"
  );
  const [customZoneCode, setCustomZoneCode] = useState<string>("ZONE_CBD_URBAN_CORE");
  const [customBasePriceM2, setCustomBasePriceM2] = useState<number>(85);

  // Thông số thửa đất / căn hộ vi mô
  const [areaM2, setAreaM2] = useState<number>(90);
  const [frontageM, setFrontageM] = useState<number>(6.0);
  const [alleyWidthM, setAlleyWidthM] = useState<number>(8.0);
  const [careerTier, setCareerTier] = useState<string>("T4_MIDDLE_SENIOR");
  const [hasRedBook, setHasRedBook] = useState<boolean>(true);
  const [observedSamples, setObservedSamples] = useState<number>(15);

  const [wardVal, setWardVal] = useState<WardValuationResponse | null>(null);
  const [loadingVal, setLoadingVal] = useState<boolean>(false);

  // Trạng thái Kiểm toán 6 Cổng BĐS & Quét lịch sử
  const [portals, setPortals] = useState<PortalAuditItem[]>([]);
  const [roadmap, setRoadmap] = useState<
    Array<{ phase: string; title: string; target_records: number; command: string }>
  >([]);
  const [autoHealStatus, setAutoHealStatus] = useState<string>("");
  const [backfillStatus, setBackfillStatus] = useState<string>("");
  const [runningAction, setRunningAction] = useState<boolean>(false);
  const [fromYear, setFromYear] = useState<number>(2021);
  const [deepPages, setDeepPages] = useState<number>(15);

  // Lọc danh sách Phường/Xã theo Tỉnh 34, Phân khu kinh tế và Từ khóa tìm kiếm
  const filteredWards = useMemo(() => {
    const q = wardSearchQuery.trim().toLowerCase();
    return WARD_CATALOG.filter((w) => {
      if (filterProvince34 !== "ALL" && w.code34 !== filterProvince34) return false;
      if (filterZoneCode !== "ALL" && w.zoneCode !== filterZoneCode) return false;
      if (q) {
        const hay = `${w.wardName} ${w.districtLegacy} ${w.legacy63} ${w.code34} ${w.sampleDescription}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [filterProvince34, filterZoneCode, wardSearchQuery]);

  // Đảm bảo selectedWardCode luôn hợp lệ khi đổi bộ lọc
  useEffect(() => {
    if (wardSelectMode === "CATALOG" && filteredWards.length > 0) {
      if (!filteredWards.some((w) => w.code === selectedWardCode)) {
        setSelectedWardCode(filteredWards[0].code);
      }
    }
  }, [filteredWards, selectedWardCode, wardSelectMode]);

  // Đồng bộ Tỉnh lịch sử 63 và Đơn giá cơ sở khi đổi Tỉnh 34 ở chế độ CUSTOM
  const handleCustomProvince34Change = (newCode34: string) => {
    setCustomProvince34(newCode34);
    const pEntry = PROVINCES_34_CATALOG.find((p) => p.code34 === newCode34);
    if (pEntry) {
      setCustomLegacy63(pEntry.legacy63List[0] || pEntry.name34);
      const zMult = ECONOMIC_ZONES_CATALOG[customZoneCode]?.multiplier || 1.0;
      setCustomBasePriceM2(Number((pEntry.defaultBasePriceM2 * zMult).toFixed(1)));
    }
  };

  const fetchWardValuation = async () => {
    setLoadingVal(true);
    try {
      let payload: Record<string, unknown>;
      if (wardSelectMode === "CATALOG") {
        const found =
          WARD_CATALOG.find((w) => w.code === selectedWardCode) || WARD_CATALOG[0];
        payload = {
          preset_ward_code: found.code,
          ward_code: found.code,
          ward_name: `${found.wardName} (${found.districtLegacy})`,
          province_34_code: found.code34,
          legacy_province_63: found.legacy63,
          economic_zone_override: found.zoneCode,
          parent_prior_override_m2: found.basePriceM2,
          raw_location: `${found.wardName}, ${found.districtLegacy}, ${found.legacy63}`,
          full_text: found.sampleDescription,
          career_tier: careerTier,
          area_m2: areaM2,
          frontage_m: frontageM,
          alley_width_m: alleyWidthM,
          has_red_book: hasRedBook,
          observed_ward_samples: observedSamples,
        };
      } else {
        const zMeta =
          ECONOMIC_ZONES_CATALOG[customZoneCode] ||
          ECONOMIC_ZONES_CATALOG.ZONE_CBD_URBAN_CORE;
        payload = {
          preset_ward_code: `${customProvince34}_CUSTOM_WARD`,
          ward_code: `${customProvince34}_CUSTOM_WARD`,
          ward_name: customWardName.trim() || "Phường/Xã Tùy chỉnh",
          province_34_code: customProvince34,
          legacy_province_63: customLegacy63,
          economic_zone_override: customZoneCode,
          parent_prior_override_m2: customBasePriceM2,
          raw_location: `${customWardName}, ${customLegacy63}`,
          full_text: `${customWardName} thuộc ${zMeta.fullName}, ${customLegacy63}`,
          career_tier: careerTier,
          area_m2: areaM2,
          frontage_m: frontageM,
          alley_width_m: alleyWidthM,
          has_red_book: hasRedBook,
          observed_ward_samples: observedSamples,
        };
      }

      const res = await fetch("/api/jobs/ward-valuation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setWardVal(data);
      }
    } catch {
      // Ignore network error
    } finally {
      setLoadingVal(false);
    }
  };

  const fetchPortalAudit = async () => {
    try {
      const res = await fetch("/api/jobs/portal-audit");
      if (res.ok) {
        const data = await res.json();
        setPortals(data.portals_audit || []);
        setRoadmap(data.four_phase_execution_roadmap || []);
      }
    } catch {
      // Ignore error
    }
  };

  useEffect(() => {
    fetchWardValuation();
    fetchPortalAudit();
  }, [
    wardSelectMode,
    selectedWardCode,
    customProvince34,
    customLegacy63,
    customZoneCode,
    customBasePriceM2,
    areaM2,
    frontageM,
    alleyWidthM,
    careerTier,
    hasRedBook,
    observedSamples,
  ]);

  const handleTriggerAutoHeal = async () => {
    setRunningAction(true);
    setAutoHealStatus(
      "Đang rà soát lỗi các cổng BĐS, tự động hiệu chỉnh cấu hình & quét bù DLQ..."
    );
    try {
      const res = await fetch("/api/jobs/portal-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto-heal" }),
      });
      const data = await res.json();
      const healed = data.dlq_auto_heal?.resolved_after_heal ?? 0;
      const tuned = (data.auto_tuning_actions || []).length;
      setAutoHealStatus(
        `Hoàn tất Auto-Heal: Đã tự động tối ưu ${tuned} cổng, khôi phục thành công ${healed} bản ghi lỗi từ DLQ.`
      );
      fetchPortalAudit();
    } catch {
      setAutoHealStatus(
        "Đã ghi nhận lệnh Auto-Heal trên tiến trình nền Docker."
      );
    } finally {
      setRunningAction(false);
    }
  };

  const handleTriggerBackfill2021 = async () => {
    setRunningAction(true);
    setBackfillStatus(
      `Đang kích hoạt quét dữ liệu lịch sử BĐS giai đoạn ${fromYear}–2026 (${deepPages} trang sâu/từ khóa + Wayback CDX)...`
    );
    try {
      const res = await fetch("/api/jobs/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_year: fromYear,
          deep_pages: deepPages,
          max_jobs_per_site: 400,
          use_mock: false,
        }),
      });
      const data = await res.json();
      const totalSaved =
        data?.backfill_result?.total_upserted ||
        data?.scraped_analytics?.total_records ||
        0;
      setBackfillStatus(
        `Chiến dịch Quét Lịch sử ${fromYear}–2026 hoàn tất đợt 1: Tổng kho hiện đạt ${totalSaved} bản ghi BĐS chuẩn hóa (34/63 Tỉnh).`
      );
    } catch {
      setBackfillStatus(
        `Đã gửi lệnh quét lịch sử ${fromYear}–2026 tới container scraper-etl.`
      );
    } finally {
      setRunningAction(false);
    }
  };

  const selectedCatalogWard = useMemo(
    () =>
      WARD_CATALOG.find((w) => w.code === selectedWardCode) || WARD_CATALOG[0],
    [selectedWardCode]
  );

  const selectedCustomProvinceMeta = useMemo(
    () =>
      PROVINCES_34_CATALOG.find((p) => p.code34 === customProvince34) ||
      PROVINCES_34_CATALOG[0],
    [customProvince34]
  );

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      {/* KHỐI HEADER & BẢN ĐỒ Ý NGHĨA CHỨC NĂNG */}
      <section
        className="lab-card"
        style={{
          border: "1px solid rgba(52, 211, 153, 0.4)",
          background:
            "linear-gradient(145deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.92))",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "0.85rem",
            paddingBottom: "0.9rem",
            borderBottom: "1px solid #334155",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                flexWrap: "wrap",
                marginBottom: "0.35rem",
              }}
            >
              <span className="badge badge-green">
                PHÂN HỆ 1A • ĐỊNH GIÁ VI MÔ CẤP PHƯỜNG/XÃ
              </span>
              <span className="badge badge-blue">
                34 Tỉnh/Thành Mới (NQ 202/2025/QH15) ↔ 63 Tỉnh/Thành Lịch sử
              </span>
              <span className="badge badge-amber">
                Co giãn Không gian Empirical Bayes 4 Cấp
              </span>
            </div>
            <h2 style={{ fontSize: "1.2rem", color: "#f8fafc", margin: 0 }}>
              🗺️ Trung tâm Định giá Tự động Bất động sản Cấp Phường/Xã &amp; Phân
              giải Địa giới Kép (34 ↔ 63 Tỉnh)
            </h2>
            <p
              style={{
                fontSize: "0.83rem",
                color: "#94a3b8",
                marginTop: "0.3rem",
                maxWidth: "920px",
              }}
            >
              Giải quyết bài toán định giá BĐS sau cải cách hành chính (sáp nhập
              63 tỉnh thành 34 tỉnh/thành mới và quản lý trực tiếp xuống cấp
              Phường/Xã): kết hợp{" "}
              <strong style={{ color: "#38bdf8" }}>
                Ánh xạ Địa danh Kép (34 ↔ 63)
              </strong>
              ,{" "}
              <strong style={{ color: "#34d399" }}>
                6 Phân khu Kinh tế Đặc thù
              </strong>{" "}
              và thuật toán{" "}
              <strong style={{ color: "#fbbf24" }}>
                Co rút Không gian Empirical Bayes
              </strong>{" "}
              để định giá chính xác cho mọi Phường/Xã trên toàn quốc.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className={`tab-btn ${showMethodGuide ? "active" : ""}`}
              style={{ fontSize: "0.78rem", padding: "0.4rem 0.75rem" }}
              onClick={() => setShowMethodGuide((v) => !v)}
            >
              {showMethodGuide
                ? "🔼 Thu gọn Giải thích Chức năng"
                : "💡 Trang này thể hiện nội dung gì?"}
            </button>
          </div>
        </div>

        {/* HỘP GIẢI THÍCH TƯỜNG MINH: TRANG NÀY THỂ HIỆN NỘI DUNG GÌ & VÌ SAO KHÔNG GIỚI HẠN PHƯỜNG/XÃ */}
        {showMethodGuide && (
          <div
            style={{
              marginTop: "0.9rem",
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "0.65rem",
              padding: "0.9rem 1rem",
            }}
          >
            <div
              style={{
                fontSize: "0.84rem",
                fontWeight: 700,
                color: "#38bdf8",
                marginBottom: "0.6rem",
              }}
            >
              📌 Giải thích Chuyên môn: Phân hệ Định giá Cấp Phường/Xã này thể
              hiện nội dung gì và vận hành ra sao?
            </div>
            <div className="rwd-grid-3" style={{ gap: "0.75rem" }}>
              <div
                style={{
                  background: "rgba(30, 41, 59, 0.7)",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                  borderRadius: "0.55rem",
                  padding: "0.7rem 0.85rem",
                  fontSize: "0.79rem",
                  color: "#cbd5e1",
                }}
              >
                <div style={{ color: "#38bdf8", fontWeight: 700, marginBottom: "0.25rem" }}>
                  1. Phân giải Địa giới Hành chính Kép (34 ↔ 63 Tỉnh)
                </div>
                Từ 2025–2026, Việt Nam vận hành{" "}
                <strong>34 Tỉnh/Thành mới</strong> (ví dụ: TP.HCM hợp nhất Bình
                Dương &amp; Bà Rịa - Vũng Tàu; Bắc Ninh hợp nhất Bắc Giang; Hải
                Phòng hợp nhất Hải Dương...) và quản lý trực tiếp xuống{" "}
                <strong>Phường/Xã</strong>. Hệ thống tự động đối chiếu hai chiều
                giữa <strong>63 Tỉnh/Quận cũ</strong> trên tin rao với{" "}
                <strong>34 Tỉnh/Phường mới</strong> để không mất lịch sử giá
                2021–2026.
              </div>

              <div
                style={{
                  background: "rgba(30, 41, 59, 0.7)",
                  border: "1px solid rgba(52, 211, 153, 0.3)",
                  borderRadius: "0.55rem",
                  padding: "0.7rem 0.85rem",
                  fontSize: "0.79rem",
                  color: "#cbd5e1",
                }}
              >
                <div style={{ color: "#34d399", fontWeight: 700, marginBottom: "0.25rem" }}>
                  2. Định vị 6 Phân khu Kinh tế Đặc thù Cấp Phường/Xã
                </div>
                Trong cùng một tỉnh, giá BĐS chênh lệch gấp 3–10 lần tùy chức
                năng kinh tế của Phường/Xã. Mô hình bóc tách 6 phân khu:{" "}
                <strong>Lõi CBD (×1.35)</strong>,{" "}
                <strong>Du lịch Biển/Đảo (×1.22)</strong>,{" "}
                <strong>Khu CNC &amp; Metro TOD (×1.20)</strong>,{" "}
                <strong>Làng nghề Truyền thống (×1.18)</strong>,{" "}
                <strong>KCN FDI (×1.12)</strong> và{" "}
                <strong>Khu Dân cư Ven đô (×0.90)</strong>.
              </div>

              <div
                style={{
                  background: "rgba(30, 41, 59, 0.7)",
                  border: "1px solid rgba(251, 191, 36, 0.3)",
                  borderRadius: "0.55rem",
                  padding: "0.7rem 0.85rem",
                  fontSize: "0.79rem",
                  color: "#cbd5e1",
                }}
              >
                <div style={{ color: "#fbbf24", fontWeight: 700, marginBottom: "0.25rem" }}>
                  3. Co giãn Empirical Bayes &amp; Mở khóa Mọi Phường/Xã
                </div>
                Công thức{" "}
                <code>
                  P̂_ward = ω_w·P̄_ward + (1 - ω_w)·P_prior
                </code>{" "}
                với <code>ω_w = n_w / (n_w + 15)</code> giúp chống nhiễu khi
                Phường/Xã có ít tin rao (<code>n_w</code> nhỏ). Bạn có thể{" "}
                <strong>chọn từ 34/63 Tỉnh &amp; 55+ Phường tiêu biểu</strong>{" "}
                HOẶC bật{" "}
                <strong style={{ color: "#34d399" }}>
                  &ldquo;✍️ Tự nhập Phường/Xã bất kỳ&rdquo;
                </strong>{" "}
                để định giá <strong>không giới hạn 100% Phường/Xã</strong> toàn
                quốc.
              </div>
            </div>
          </div>
        )}

        {/* THANH CHUYỂN ĐỔI 3 CHẾ ĐỘ TRONG TRUNG TÂM PHƯỜNG/XÃ */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
            marginTop: "0.9rem",
          }}
        >
          <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className={`tab-btn ${
                hubSectionMode === "WARD_VALUATION" ? "active" : ""
              }`}
              onClick={() => setHubSectionMode("WARD_VALUATION")}
            >
              🏘️ 1. Định giá BĐS Cấp Phường/Xã (Đa cấp 34/63 Tỉnh &amp; Tự nhập
              Toàn quốc)
            </button>
            <button
              type="button"
              className={`tab-btn ${
                hubSectionMode === "PROVINCE_34_63_MAP" ? "active" : ""
              }`}
              onClick={() => setHubSectionMode("PROVINCE_34_63_MAP")}
            >
              🧭 2. Bảng Tra cứu 34 Tỉnh/Thành Mới ↔ 63 Tỉnh/Thành Cũ
            </button>
            <button
              type="button"
              className={`tab-btn ${
                hubSectionMode === "PORTAL_AUDIT" ? "active" : ""
              }`}
              onClick={() => setHubSectionMode("PORTAL_AUDIT")}
            >
              🕷️ 3. Kiểm toán 6 Cổng BĐS &amp; Quét Lịch sử 2021–2026
            </button>
          </div>
        </div>
      </section>

      {/* =====================================================================
          CHẾ ĐỘ 1: MÔ HÌNH ĐỊNH GIÁ CẤP PHƯỜNG/XÃ & PHÂN GIẢI ĐỊA LÝ KÉP
      ===================================================================== */}
      {hubSectionMode === "WARD_VALUATION" && (
        <section className="rwd-grid-2">
          {/* CỘT TRÁI: BỘ CHỌN PHƯỜNG/XÃ ĐA CẤP (KHÔNG GIỚI HẠN) & THÔNG SỐ THỬA ĐẤT */}
          <div className="lab-card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.5rem",
                marginBottom: "0.85rem",
              }}
            >
              <h3 style={{ fontSize: "1.02rem", color: "#34d399", margin: 0 }}>
                1. Chọn Phường/Xã (34/63 Tỉnh) &amp; Cấu hình Thửa đất / Căn hộ
              </h3>
              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={`tab-btn ${
                    wardSelectMode === "CATALOG" ? "active" : ""
                  }`}
                  style={{ fontSize: "0.75rem", padding: "0.3rem 0.65rem" }}
                  onClick={() => setWardSelectMode("CATALOG")}
                >
                  📋 Danh mục 34/63 Tỉnh ({WARD_CATALOG.length} Phường/Xã mẫu)
                </button>
                <button
                  type="button"
                  className={`tab-btn ${
                    wardSelectMode === "CUSTOM" ? "active" : ""
                  }`}
                  style={{ fontSize: "0.75rem", padding: "0.3rem 0.65rem" }}
                  onClick={() => setWardSelectMode("CUSTOM")}
                >
                  ✍️ Tự nhập Phường/Xã bất kỳ (Toàn quốc)
                </button>
              </div>
            </div>

            {wardSelectMode === "CATALOG" ? (
              <div
                style={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: "0.6rem",
                  padding: "0.85rem",
                  marginBottom: "0.9rem",
                  display: "grid",
                  gap: "0.7rem",
                }}
              >
                <div className="rwd-subgrid-2">
                  <label style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
                    Bước 1A — Lọc theo Tỉnh/Thành (34 Tỉnh mới ↔ 63 Tỉnh cũ):
                    <select
                      value={filterProvince34}
                      onChange={(e) => setFilterProvince34(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "0.45rem 0.55rem",
                        marginTop: "0.25rem",
                        background: "#1e293b",
                        color: "#f8fafc",
                        border: "1px solid #475569",
                        borderRadius: "0.4rem",
                        fontSize: "0.8rem",
                      }}
                    >
                      <option value="ALL">
                        🌐 Tất cả 34 Tỉnh/Thành mới (63 Tỉnh/Thành lịch sử)
                      </option>
                      {PROVINCES_34_CATALOG.map((p) => (
                        <option key={p.code34} value={p.code34}>
                          [{p.code34}] {p.name34}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
                    Bước 1B — Lọc theo 6 Phân khu Kinh tế Đặc thù:
                    <select
                      value={filterZoneCode}
                      onChange={(e) => setFilterZoneCode(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "0.45rem 0.55rem",
                        marginTop: "0.25rem",
                        background: "#1e293b",
                        color: "#f8fafc",
                        border: "1px solid #475569",
                        borderRadius: "0.4rem",
                        fontSize: "0.8rem",
                      }}
                    >
                      <option value="ALL">
                        🏙️ Tất cả 6 Phân khu Kinh tế Đặc thù
                      </option>
                      {Object.values(ECONOMIC_ZONES_CATALOG).map((z) => (
                        <option key={z.code} value={z.code}>
                          {z.shortName} (Hệ số ×{z.multiplier})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
                  Tìm kiếm nhanh tên Phường/Xã, Quận/Huyện, Khu đô thị hoặc KCN:
                  <input
                    type="text"
                    value={wardSearchQuery}
                    onChange={(e) => setWardSearchQuery(e.target.value)}
                    placeholder="VD: Đồng Kỵ, Bến Nghé, Thủ Thiêm, Dĩ An, Cầu Giấy, Bãi Cháy, Phú Quốc..."
                    style={{
                      width: "100%",
                      padding: "0.45rem 0.65rem",
                      marginTop: "0.25rem",
                      background: "#1e293b",
                      color: "#f8fafc",
                      border: "1px solid #475569",
                      borderRadius: "0.4rem",
                      fontSize: "0.8rem",
                    }}
                  />
                </label>

                <label style={{ fontSize: "0.82rem", color: "#f8fafc", fontWeight: 600 }}>
                  Bước 2 — Chọn Phường/Xã/Thị trấn ({filteredWards.length} đơn vị khớp bộ lọc):
                  <select
                    value={selectedWardCode}
                    onChange={(e) => setSelectedWardCode(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.52rem 0.6rem",
                      marginTop: "0.25rem",
                      background: "#1e293b",
                      color: "#34d399",
                      fontWeight: 700,
                      border: "1px solid #34d399",
                      borderRadius: "0.45rem",
                      fontSize: "0.83rem",
                    }}
                  >
                    {filteredWards.length > 0 ? (
                      filteredWards.map((w) => {
                        const zShort =
                          ECONOMIC_ZONES_CATALOG[w.zoneCode]?.shortName ||
                          w.zoneCode;
                        return (
                          <option key={w.code} value={w.code}>
                            [{w.code34} • {w.legacy63}] {w.wardName} —{" "}
                            {w.districtLegacy} ({zShort} • Chuẩn:{" "}
                            {w.basePriceM2} tr/m²)
                          </option>
                        );
                      })
                    ) : (
                      <option value={selectedCatalogWard.code}>
                        Không tìm thấy trong danh mục mẫu — Hãy nhấn nút &ldquo;✍️ Tự nhập Phường/Xã bất kỳ&rdquo; ở trên!
                      </option>
                    )}
                  </select>
                </label>

                <div
                  style={{
                    fontSize: "0.76rem",
                    color: "#94a3b8",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.4rem",
                  }}
                >
                  <span>
                    📍 Đặc điểm khu vực:{" "}
                    <strong style={{ color: "#e2e8f0" }}>
                      {selectedCatalogWard.sampleDescription}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setWardSelectMode("CUSTOM")}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#38bdf8",
                      cursor: "pointer",
                      fontSize: "0.76rem",
                      fontWeight: 700,
                      textDecoration: "underline",
                      padding: 0,
                    }}
                  >
                    Phường/Xã bạn tìm chưa có trong danh sách? Tự nhập ngay →
                  </button>
                </div>
              </div>
            ) : (
              /* CHẾ ĐỘ TỰ NHẬP BẤT KỲ PHƯỜNG/XÃ NÀO TRÊN TOÀN QUỐC (KHÔNG GIỚI HẠN) */
              <div
                style={{
                  background: "#0f172a",
                  border: "1px solid #38bdf8",
                  borderRadius: "0.6rem",
                  padding: "0.85rem",
                  marginBottom: "0.9rem",
                  display: "grid",
                  gap: "0.7rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.79rem",
                    color: "#38bdf8",
                    fontWeight: 700,
                  }}
                >
                  ✍️ Chế độ Mở khóa Toàn quốc: Nhập bất kỳ Phường/Xã/Thị trấn,
                  Quận/Huyện, Đường/Phố hoặc Khu đô thị nào tại 34/63 Tỉnh Thành
                </div>

                <div className="rwd-subgrid-2">
                  <label style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
                    1. Chọn Tỉnh/Thành Mới (34 Tỉnh NQ 202/2025/QH15):
                    <select
                      value={customProvince34}
                      onChange={(e) =>
                        handleCustomProvince34Change(e.target.value)
                      }
                      style={{
                        width: "100%",
                        padding: "0.45rem 0.55rem",
                        marginTop: "0.25rem",
                        background: "#1e293b",
                        color: "#f8fafc",
                        border: "1px solid #475569",
                        borderRadius: "0.4rem",
                        fontSize: "0.8rem",
                      }}
                    >
                      {PROVINCES_34_CATALOG.map((p) => (
                        <option key={p.code34} value={p.code34}>
                          [{p.code34}] {p.name34}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
                    2. Tỉnh/Thành Lịch sử (63 Tỉnh cũ tương ứng):
                    <select
                      value={customLegacy63}
                      onChange={(e) => setCustomLegacy63(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "0.45rem 0.55rem",
                        marginTop: "0.25rem",
                        background: "#1e293b",
                        color: "#fbbf24",
                        fontWeight: 600,
                        border: "1px solid #475569",
                        borderRadius: "0.4rem",
                        fontSize: "0.8rem",
                      }}
                    >
                      {selectedCustomProvinceMeta.legacy63List.map((leg) => (
                        <option key={leg} value={leg}>
                          {leg} (thuộc {selectedCustomProvinceMeta.code34} mới)
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
                  3. Nhập tên Phường/Xã/Thị trấn, Quận/Huyện &amp; Tuyến đường /
                  Dự án BĐS:
                  <input
                    type="text"
                    value={customWardName}
                    onChange={(e) => setCustomWardName(e.target.value)}
                    placeholder="VD: Phường Lĩnh Nam, Quận Hoàng Mai (Ngõ Tân Khai) hoặc Xã An Khánh, Hoài Đức..."
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.65rem",
                      marginTop: "0.25rem",
                      background: "#1e293b",
                      color: "#34d399",
                      fontWeight: 700,
                      border: "1px solid #38bdf8",
                      borderRadius: "0.4rem",
                      fontSize: "0.83rem",
                    }}
                  />
                </label>

                <div className="rwd-subgrid-2">
                  <label style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
                    4. Phân khu Kinh tế Đặc thù của Phường/Xã này:
                    <select
                      value={customZoneCode}
                      onChange={(e) => {
                        const newZ = e.target.value;
                        setCustomZoneCode(newZ);
                        const zMult =
                          ECONOMIC_ZONES_CATALOG[newZ]?.multiplier || 1.0;
                        setCustomBasePriceM2(
                          Number(
                            (
                              selectedCustomProvinceMeta.defaultBasePriceM2 *
                              zMult
                            ).toFixed(1)
                          )
                        );
                      }}
                      style={{
                        width: "100%",
                        padding: "0.45rem 0.55rem",
                        marginTop: "0.25rem",
                        background: "#1e293b",
                        color: "#f8fafc",
                        border: "1px solid #475569",
                        borderRadius: "0.4rem",
                        fontSize: "0.8rem",
                      }}
                    >
                      {Object.values(ECONOMIC_ZONES_CATALOG).map((z) => (
                        <option key={z.code} value={z.code}>
                          {z.shortName} (×{z.multiplier})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
                    5. Đơn giá Prior tham chiếu khu vực (triệu VNĐ/m²):
                    <input
                      type="number"
                      min={2}
                      max={1000}
                      step={1}
                      value={customBasePriceM2}
                      onChange={(e) =>
                        setCustomBasePriceM2(
                          Math.max(2, Number(e.target.value))
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "0.45rem 0.55rem",
                        marginTop: "0.25rem",
                        background: "#1e293b",
                        color: "#f8fafc",
                        border: "1px solid #475569",
                        borderRadius: "0.4rem",
                        fontSize: "0.8rem",
                      }}
                    />
                  </label>
                </div>
              </div>
            )}

            {/* THÔNG SỐ VI MÔ CỦA THỬA ĐẤT / CĂN HỘ */}
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <div className="rwd-grid-4">
                <label style={{ fontSize: "0.79rem", color: "#cbd5e1" }}>
                  Diện tích (m²):
                  <input
                    type="number"
                    min={10}
                    max={5000}
                    value={areaM2}
                    onChange={(e) =>
                      setAreaM2(Math.max(10, Number(e.target.value)))
                    }
                    style={{
                      width: "100%",
                      padding: "0.45rem 0.55rem",
                      marginTop: "0.25rem",
                      background: "#1e293b",
                      color: "#fff",
                      border: "1px solid #334155",
                      borderRadius: "0.4rem",
                      fontWeight: 700,
                    }}
                  />
                </label>

                <label style={{ fontSize: "0.79rem", color: "#cbd5e1" }}>
                  Mặt tiền (m):
                  <input
                    type="number"
                    step="0.5"
                    min={2}
                    max={100}
                    value={frontageM}
                    onChange={(e) =>
                      setFrontageM(Math.max(2, Number(e.target.value)))
                    }
                    style={{
                      width: "100%",
                      padding: "0.45rem 0.55rem",
                      marginTop: "0.25rem",
                      background: "#1e293b",
                      color: "#fff",
                      border: "1px solid #334155",
                      borderRadius: "0.4rem",
                      fontWeight: 700,
                    }}
                  />
                </label>

                <label style={{ fontSize: "0.79rem", color: "#cbd5e1" }}>
                  Rộng ngõ/đường (m):
                  <input
                    type="number"
                    step="0.5"
                    min={1}
                    max={60}
                    value={alleyWidthM}
                    onChange={(e) =>
                      setAlleyWidthM(Math.max(1, Number(e.target.value)))
                    }
                    style={{
                      width: "100%",
                      padding: "0.45rem 0.55rem",
                      marginTop: "0.25rem",
                      background: "#1e293b",
                      color: "#fff",
                      border: "1px solid #334155",
                      borderRadius: "0.4rem",
                      fontWeight: 700,
                    }}
                  />
                </label>

                <label style={{ fontSize: "0.79rem", color: "#cbd5e1" }}>
                  Cỡ mẫu Phường (n_w):
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={observedSamples}
                    onChange={(e) =>
                      setObservedSamples(Math.max(0, Number(e.target.value)))
                    }
                    style={{
                      width: "100%",
                      padding: "0.45rem 0.55rem",
                      marginTop: "0.25rem",
                      background: "#1e293b",
                      color: "#38bdf8",
                      border: "1px solid #334155",
                      borderRadius: "0.4rem",
                      fontWeight: 700,
                    }}
                  />
                </label>
              </div>

              <div className="rwd-subgrid-2" style={{ alignItems: "end" }}>
                <label style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
                  Phân tầng Giá trị BĐS (Tháp 6 Tầng T1 – T6):
                  <select
                    value={careerTier}
                    onChange={(e) => setCareerTier(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.48rem 0.55rem",
                      marginTop: "0.25rem",
                      background: "#1e293b",
                      color: "#fff",
                      border: "1px solid #334155",
                      borderRadius: "0.4rem",
                      fontSize: "0.8rem",
                    }}
                  >
                    <option value="T1_INTERN">
                      T1_AFFORDABLE: Tầng 1 — Bình dân / NOXH / Hẻm nhỏ (×0.68)
                    </option>
                    <option value="T2_FRESHER">
                      T2_MID_MARKET: Tầng 2 — Trung cấp / Ngõ ba gác (×0.85)
                    </option>
                    <option value="T3_JUNIOR">
                      T3_UPPER_MID: Tầng 3 — Khá / Chuẩn Đô thị (×1.00)
                    </option>
                    <option value="T4_MIDDLE_SENIOR">
                      T4_PREMIUM: Tầng 4 — Cao cấp / Phân lô Ô tô tránh (×1.32)
                    </option>
                    <option value="T5_LEAD_MANAGER">
                      T5_LUXURY: Tầng 5 — Hạng sang / Biệt thự / Shophouse (×1.75)
                    </option>
                    <option value="T6_DIRECTOR">
                      T6_TROPHY_ULTRA: Tầng 6 — Dinh thự / Mặt phố Đắc địa (×2.45)
                    </option>
                  </select>
                </label>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "0.45rem",
                    padding: "0.48rem 0.7rem",
                  }}
                >
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      fontSize: "0.8rem",
                      color: "#e2e8f0",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={hasRedBook}
                      onChange={(e) => setHasRedBook(e.target.checked)}
                    />
                    <span>
                      Sổ đỏ / Sổ hồng riêng{" "}
                      <strong style={{ color: hasRedBook ? "#34d399" : "#f87171" }}>
                        ({hasRedBook ? "+8% Pháp lý chuẩn" : "-22% Chiết khấu rủi ro"})
                      </strong>
                    </span>
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={fetchWardValuation}
                disabled={loadingVal}
                className="tab-btn active"
                style={{
                  width: "100%",
                  padding: "0.6rem 1rem",
                  fontSize: "0.86rem",
                  fontWeight: 700,
                  textAlign: "center",
                }}
              >
                {loadingVal
                  ? "⏳ Đang tính toán Co giãn Empirical Bayes & Phân giải 34↔63 Tỉnh..."
                  : "🚀 Cập nhật Định giá Cấp Phường/Xã Ngay"}
              </button>
            </div>
          </div>

          {/* CỘT PHẢI: KẾT QUẢ PHÂN GIẢI ĐỊA LÝ KÉP (34 <-> 63 TỈNH) & DẢI ĐỊNH GIÁ P10-P90 */}
          <div className="lab-card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.5rem",
                marginBottom: "0.85rem",
              }}
            >
              <h3 style={{ fontSize: "1.02rem", color: "#38bdf8", margin: 0 }}>
                2. Kết quả Phân giải Địa lý Kép (34 ↔ 63 Tỉnh) &amp; Định giá
                Phường/Xã
              </h3>
              {wardVal && (
                <span
                  className={`badge ${
                    wardVal.valuation_result.confidence_tier ===
                    "HIGH_WARD_CONFIDENCE"
                      ? "badge-green"
                      : wardVal.valuation_result.confidence_tier ===
                        "MEDIUM_EB_SHRINKAGE"
                      ? "badge-blue"
                      : "badge-amber"
                  }`}
                >
                  {wardVal.valuation_result.confidence_tier ===
                  "HIGH_WARD_CONFIDENCE"
                    ? "Độ tin cậy cao (n_w ≥ 20)"
                    : wardVal.valuation_result.confidence_tier ===
                      "MEDIUM_EB_SHRINKAGE"
                    ? "Co giãn Empirical Bayes Cân bằng"
                    : "Nội suy Không gian Prior (n_w nhỏ)"}
                </span>
              )}
            </div>

            {wardVal ? (
              <div style={{ display: "grid", gap: "0.85rem" }}>
                {/* HỘP ÁNH XẠ ĐỊA GIỚI HÀNH CHÍNH KÉP 34 <-> 63 TỈNH */}
                <div
                  className="rwd-subgrid-2"
                  style={{
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "0.6rem",
                    padding: "0.8rem 0.9rem",
                    gap: "0.65rem",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "0.74rem", color: "#94a3b8" }}>
                      🏛️ Tỉnh/Thành Mới (34 Tỉnh — NQ 202/2025/QH15):
                    </div>
                    <div
                      style={{
                        fontSize: "0.86rem",
                        fontWeight: 700,
                        color: "#f8fafc",
                        marginTop: "0.15rem",
                      }}
                    >
                      [{wardVal.dual_address_resolution.province_34_code}]{" "}
                      {wardVal.dual_address_resolution.province_34_name}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: "0.74rem", color: "#94a3b8" }}>
                      📜 Tỉnh/Thành Cũ (Hệ quy chiếu 63 Tỉnh lịch sử):
                    </div>
                    <div
                      style={{
                        fontSize: "0.86rem",
                        fontWeight: 700,
                        color: "#fbbf24",
                        marginTop: "0.15rem",
                      }}
                    >
                      {wardVal.dual_address_resolution.legacy_province_63} (Vùng:{" "}
                      {wardVal.dual_address_resolution.macro_region})
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: "0.74rem", color: "#94a3b8" }}>
                      📍 Đơn vị Hành chính Cấp Phường/Xã:
                    </div>
                    <div
                      style={{
                        fontSize: "0.86rem",
                        fontWeight: 700,
                        color: "#34d399",
                        marginTop: "0.15rem",
                      }}
                    >
                      {wardVal.dual_address_resolution.ward_name}{" "}
                      <span
                        style={{
                          fontSize: "0.74rem",
                          color: "#94a3b8",
                          fontWeight: 500,
                        }}
                      >
                        ({wardVal.dual_address_resolution.ward_code})
                      </span>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: "0.74rem", color: "#94a3b8" }}>
                      🏗️ Phân khu Kinh tế Đặc thù &amp; Hệ số Vùng:
                    </div>
                    <div
                      style={{
                        fontSize: "0.84rem",
                        fontWeight: 700,
                        color: "#38bdf8",
                        marginTop: "0.15rem",
                      }}
                    >
                      {wardVal.dual_address_resolution.economic_zone_name_vi}{" "}
                      <span className="badge badge-blue">
                        ×
                        {
                          wardVal.empirical_bayes_shrinkage
                            .economic_zone_multiplier
                        }
                      </span>
                    </div>
                  </div>
                </div>

                {/* HỘP KẾT QUẢ TRUNG VỊ P50 NỔI BẬT */}
                <div
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(16, 185, 129, 0.14), rgba(59, 130, 246, 0.14))",
                    border: "1px solid rgba(52, 211, 153, 0.45)",
                    borderRadius: "0.65rem",
                    padding: "0.9rem 1rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "0.76rem",
                          color: "#a7f3d0",
                          fontWeight: 700,
                          textTransform: "uppercase",
                        }}
                      >
                        Đơn giá Định giá Chuẩn AVM Cấp Phường/Xã (Trung vị P50)
                      </div>
                      <div
                        style={{
                          fontSize: "1.85rem",
                          fontWeight: 800,
                          color: "#34d399",
                          lineHeight: 1.2,
                          marginTop: "0.15rem",
                        }}
                      >
                        {wardVal.valuation_result.unit_price_p50_million_m2}{" "}
                        triệu VNĐ/m²
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.75rem", color: "#cbd5e1" }}>
                        Tổng Giá trị Tài sản ({wardVal.valuation_result.area_m2}{" "}
                        m²):
                      </div>
                      <div
                        style={{
                          fontSize: "1.45rem",
                          fontWeight: 800,
                          color: "#38bdf8",
                        }}
                      >
                        ≈ {wardVal.valuation_result.total_price_p50_billion_vnd}{" "}
                        tỷ VNĐ
                      </div>
                    </div>
                  </div>

                  {/* DẢI 5 MỐC PHÂN VỊ P10 - P25 - P50 - P75 - P90 */}
                  <div
                    className="rwd-grid-3"
                    style={{ marginTop: "0.75rem", gap: "0.55rem" }}
                  >
                    <div
                      style={{
                        background: "rgba(15, 23, 42, 0.82)",
                        border: "1px solid #334155",
                        borderRadius: "0.5rem",
                        padding: "0.55rem 0.7rem",
                      }}
                    >
                      <div style={{ fontSize: "0.73rem", color: "#94a3b8" }}>
                        Phân vị P10 – P25 (Vùng Mua An toàn)
                      </div>
                      <div
                        style={{
                          fontSize: "0.92rem",
                          fontWeight: 700,
                          color: "#e2e8f0",
                          marginTop: "0.15rem",
                        }}
                      >
                        {wardVal.valuation_result.unit_price_p10_million_m2} –{" "}
                        {wardVal.valuation_result.unit_price_p25_million_m2}{" "}
                        tr/m²
                      </div>
                      <div style={{ fontSize: "0.73rem", color: "#94a3b8" }}>
                        Tổng P10: ≈{" "}
                        {wardVal.valuation_result.total_price_p10_billion_vnd} tỷ
                        VNĐ
                      </div>
                    </div>

                    <div
                      style={{
                        background: "rgba(6, 78, 59, 0.45)",
                        border: "1px solid rgba(52, 211, 153, 0.5)",
                        borderRadius: "0.5rem",
                        padding: "0.55rem 0.7rem",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.73rem",
                          color: "#6ee7b7",
                          fontWeight: 700,
                        }}
                      >
                        Dải Tứ phân vị P25 – P75 (Khớp lệnh)
                      </div>
                      <div
                        style={{
                          fontSize: "0.95rem",
                          fontWeight: 800,
                          color: "#34d399",
                          marginTop: "0.15rem",
                        }}
                      >
                        {wardVal.valuation_result.unit_price_p25_million_m2} –{" "}
                        {wardVal.valuation_result.unit_price_p75_million_m2}{" "}
                        tr/m²
                      </div>
                      <div style={{ fontSize: "0.73rem", color: "#a7f3d0" }}>
                        Trung vị P50:{" "}
                        {wardVal.valuation_result.unit_price_p50_million_m2}{" "}
                        tr/m²
                      </div>
                    </div>

                    <div
                      style={{
                        background: "rgba(15, 23, 42, 0.82)",
                        border: "1px solid #334155",
                        borderRadius: "0.5rem",
                        padding: "0.55rem 0.7rem",
                      }}
                    >
                      <div style={{ fontSize: "0.73rem", color: "#94a3b8" }}>
                        Phân vị P75 – P90 (Đỉnh Kỳ vọng / Lô góc)
                      </div>
                      <div
                        style={{
                          fontSize: "0.92rem",
                          fontWeight: 700,
                          color: "#fbbf24",
                          marginTop: "0.15rem",
                        }}
                      >
                        {wardVal.valuation_result.unit_price_p75_million_m2} –{" "}
                        {wardVal.valuation_result.unit_price_p90_million_m2}{" "}
                        tr/m²
                      </div>
                      <div style={{ fontSize: "0.73rem", color: "#94a3b8" }}>
                        Tổng P90: ≈{" "}
                        {wardVal.valuation_result.total_price_p90_billion_vnd} tỷ
                        VNĐ
                      </div>
                    </div>
                  </div>
                </div>

                {/* BẢNG GIẢI TRÌNH THAM SỐ CO RÚT KHÔNG GIAN EMPIRICAL BAYES */}
                <div
                  style={{
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "0.6rem",
                    padding: "0.75rem 0.9rem",
                    fontSize: "0.79rem",
                    color: "#cbd5e1",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      color: "#e2e8f0",
                      marginBottom: "0.4rem",
                    }}
                  >
                    📐 Giải trình Toán học Co rút Không gian Empirical Bayes &amp;
                    Hedonic Vi mô:
                  </div>
                  <div className="rwd-grid-4" style={{ gap: "0.5rem" }}>
                    <div
                      style={{
                        background: "#1e293b",
                        borderRadius: "0.4rem",
                        padding: "0.45rem 0.6rem",
                      }}
                    >
                      <div style={{ fontSize: "0.71rem", color: "#94a3b8" }}>
                        Trọng số Tin cậy Phường (ω_w)
                      </div>
                      <div
                        style={{
                          fontSize: "0.88rem",
                          fontWeight: 700,
                          color: "#34d399",
                        }}
                      >
                        ω_w ={" "}
                        {
                          wardVal.empirical_bayes_shrinkage
                            .shrinkage_weight_omega
                        }
                      </div>
                      <div style={{ fontSize: "0.69rem", color: "#94a3b8" }}>
                        n_w ={" "}
                        {
                          wardVal.empirical_bayes_shrinkage
                            .observed_ward_samples_n
                        }{" "}
                        | κ ={" "}
                        {wardVal.empirical_bayes_shrinkage.prior_strength_kappa}
                      </div>
                    </div>

                    <div
                      style={{
                        background: "#1e293b",
                        borderRadius: "0.4rem",
                        padding: "0.45rem 0.6rem",
                      }}
                    >
                      <div style={{ fontSize: "0.71rem", color: "#94a3b8" }}>
                        Đơn giá Prior Khu vực
                      </div>
                      <div
                        style={{
                          fontSize: "0.88rem",
                          fontWeight: 700,
                          color: "#38bdf8",
                        }}
                      >
                        {
                          wardVal.empirical_bayes_shrinkage
                            .parent_prior_unit_price_m2
                        }{" "}
                        tr/m²
                      </div>
                      <div style={{ fontSize: "0.69rem", color: "#94a3b8" }}>
                        Quan sát Phường:{" "}
                        {wardVal.empirical_bayes_shrinkage.observed_ward_mean_m2}{" "}
                        tr/m²
                      </div>
                    </div>

                    <div
                      style={{
                        background: "#1e293b",
                        borderRadius: "0.4rem",
                        padding: "0.45rem 0.6rem",
                      }}
                    >
                      <div style={{ fontSize: "0.71rem", color: "#94a3b8" }}>
                        Nền Giá Sau Co Rút (EB)
                      </div>
                      <div
                        style={{
                          fontSize: "0.88rem",
                          fontWeight: 700,
                          color: "#fbbf24",
                        }}
                      >
                        {wardVal.empirical_bayes_shrinkage.eb_ward_baseline_m2}{" "}
                        tr/m²
                      </div>
                      <div style={{ fontSize: "0.69rem", color: "#94a3b8" }}>
                        ω·P̄_ward + (1-ω)·P_prior
                      </div>
                    </div>

                    <div
                      style={{
                        background: "#1e293b",
                        borderRadius: "0.4rem",
                        padding: "0.45rem 0.6rem",
                      }}
                    >
                      <div style={{ fontSize: "0.71rem", color: "#94a3b8" }}>
                        Hệ số Hedonic Vi mô
                      </div>
                      <div
                        style={{
                          fontSize: "0.88rem",
                          fontWeight: 700,
                          color: "#a78bfa",
                        }}
                      >
                        ×
                        {
                          wardVal.empirical_bayes_shrinkage
                            .hedonic_micro_multiplier
                        }
                      </div>
                      <div style={{ fontSize: "0.69rem", color: "#94a3b8" }}>
                        Tầng × Pháp lý × Ngõ × Mặt tiền
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: "2rem",
                  textAlign: "center",
                  color: "#94a3b8",
                  fontSize: "0.85rem",
                }}
              >
                ⏳ Đang tải dữ liệu định giá cấp Phường/Xã...
              </div>
            )}
          </div>
        </section>
      )}

      {/* =====================================================================
          CHẾ ĐỘ 2: BẢNG TRA CỨU TOÀN DIỆN 34 TỈNH/THÀNH MỚI <-> 63 TỈNH/THÀNH CŨ
      ===================================================================== */}
      {hubSectionMode === "PROVINCE_34_63_MAP" && (
        <section className="lab-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.5rem",
              marginBottom: "0.85rem",
            }}
          >
            <div>
              <h3 style={{ fontSize: "1.05rem", color: "#38bdf8", margin: 0 }}>
                🧭 Bảng Ánh xạ Song hành Toàn bộ 34 Tỉnh/Thành Mới (NQ
                202/2025/QH15) ↔ 63 Tỉnh/Thành Lịch sử
              </h3>
              <p style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                Nhấn vào nút <strong>&ldquo;Định giá Tỉnh này&rdquo;</strong> ở bất kỳ dòng nào để chuyển ngay sang chế độ định giá Phường/Xã của Tỉnh/Thành đó.
              </p>
            </div>
            <span className="badge badge-green">
              Đầy đủ 34 Tỉnh/Thành mới = 63 Tỉnh/Thành cũ
            </span>
          </div>

          <div className="table-scroll">
            <table className="lab-table">
              <thead>
                <tr>
                  <th>Mã 34 Tỉnh</th>
                  <th>Tên Tỉnh/Thành phố Mới (34 ĐVHC Cấp Tỉnh)</th>
                  <th>Các Tỉnh/Thành Lịch sử Hợp nhất (63 Tỉnh Cũ)</th>
                  <th>Vùng Kinh tế Vĩ mô</th>
                  <th>Đơn giá Cơ sở Tham chiếu</th>
                  <th>Thao tác Nhanh</th>
                </tr>
              </thead>
              <tbody>
                {PROVINCES_34_CATALOG.map((p) => (
                  <tr key={p.code34}>
                    <td>
                      <span className="badge badge-blue">{p.code34}</span>
                    </td>
                    <td>
                      <strong style={{ color: "#f8fafc" }}>{p.name34}</strong>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                        {p.legacy63List.map((leg) => (
                          <span key={leg} className="badge badge-amber">
                            {leg}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>{p.regionLabel}</td>
                    <td style={{ color: "#34d399", fontWeight: 700 }}>
                      {p.defaultBasePriceM2} tr/m²
                    </td>
                    <td>
                      <button
                        type="button"
                        className="tab-btn"
                        style={{ fontSize: "0.74rem", padding: "0.28rem 0.6rem" }}
                        onClick={() => {
                          const hasPreset = WARD_CATALOG.some(
                            (w) => w.code34 === p.code34
                          );
                          if (hasPreset) {
                            setWardSelectMode("CATALOG");
                            setFilterProvince34(p.code34);
                            setFilterZoneCode("ALL");
                          } else {
                            setWardSelectMode("CUSTOM");
                            handleCustomProvince34Change(p.code34);
                            setCustomWardName(
                              `Phường Trung tâm, ${p.legacy63List[0]}`
                            );
                          }
                          setHubSectionMode("WARD_VALUATION");
                        }}
                      >
                        Định giá Tỉnh này →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* =====================================================================
          CHẾ ĐỘ 3: KIỂM TOÁN 6 CỔNG BĐS & ĐIỀU KHIỂN QUÉT LỊCH SỬ 2021-2026
      ===================================================================== */}
      {hubSectionMode === "PORTAL_AUDIT" && (
        <section className="lab-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
              marginBottom: "0.9rem",
            }}
          >
            <div>
              <h3 style={{ fontSize: "1.05rem", color: "#fbbf24", margin: 0 }}>
                🕷️ Kiểm toán Kỹ thuật 6 Cổng Bất động sản Việt Nam &amp; Điều
                khiển Quét Hồi cứu 2021–2026
              </h3>
              <p
                style={{
                  fontSize: "0.8rem",
                  color: "#94a3b8",
                  marginTop: "0.2rem",
                }}
              >
                Thiết lập quét hồi cứu từ năm 2021 đến nay (Wayback CDX +
                Sitemap XML + Deep Pagination) và tự động rà soát lỗi/quét bù
                DLQ trên Ubuntu Docker.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: "0.45rem",
                  padding: "0.35rem 0.65rem",
                  fontSize: "0.78rem",
                }}
              >
                <span style={{ color: "#94a3b8" }}>Từ năm:</span>
                <select
                  value={fromYear}
                  onChange={(e) => setFromYear(Number(e.target.value))}
                  style={{
                    background: "#1e293b",
                    color: "#fff",
                    border: "1px solid #475569",
                    borderRadius: "0.3rem",
                    padding: "0.2rem 0.4rem",
                  }}
                >
                  {[2021, 2022, 2023, 2024, 2025, 2026].map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
                <span style={{ color: "#94a3b8", marginLeft: "0.25rem" }}>
                  Số trang sâu:
                </span>
                <input
                  type="number"
                  value={deepPages}
                  onChange={(e) => setDeepPages(Number(e.target.value))}
                  style={{
                    width: "54px",
                    background: "#1e293b",
                    color: "#fff",
                    border: "1px solid #475569",
                    borderRadius: "0.3rem",
                    padding: "0.2rem 0.4rem",
                  }}
                />
              </div>

              <button
                type="button"
                onClick={handleTriggerBackfill2021}
                disabled={runningAction}
                className="tab-btn active"
                style={{ fontSize: "0.78rem", padding: "0.45rem 0.8rem" }}
              >
                ⏳ Quét Lịch sử {fromYear}–2026 (Backfill)
              </button>

              <button
                type="button"
                onClick={handleTriggerAutoHeal}
                disabled={runningAction}
                className="tab-btn"
                style={{
                  fontSize: "0.78rem",
                  padding: "0.45rem 0.8rem",
                  borderColor: "#38bdf8",
                  color: "#38bdf8",
                }}
              >
                🔧 Tự động Rà soát Lỗi &amp; Quét Bù DLQ (Auto-Heal)
              </button>
            </div>
          </div>

          {(autoHealStatus || backfillStatus) && (
            <div
              style={{
                background: "rgba(56, 189, 248, 0.12)",
                border: "1px solid rgba(56, 189, 248, 0.4)",
                borderRadius: "0.5rem",
                padding: "0.65rem 0.85rem",
                fontSize: "0.8rem",
                color: "#bae6fd",
                marginBottom: "0.85rem",
              }}
            >
              {autoHealStatus && <div>• {autoHealStatus}</div>}
              {backfillStatus && <div>• {backfillStatus}</div>}
            </div>
          )}

          <div className="table-scroll">
            <table className="lab-table">
              <thead>
                <tr>
                  <th>Trang Web Đăng Tin BĐS</th>
                  <th>Thị phần &amp; Sản lượng</th>
                  <th>Kiến trúc Kỹ thuật &amp; Engine</th>
                  <th>Độ phủ Lịch sử 2021–2026</th>
                  <th>Trạng thái &amp; Ưu tiên</th>
                </tr>
              </thead>
              <tbody>
                {portals.map((p) => (
                  <tr key={p.portal_id}>
                    <td>
                      <strong style={{ color: "#f8fafc" }}>
                        {p.portal_name}
                      </strong>
                      <div style={{ fontSize: "0.74rem", color: "#94a3b8" }}>
                        {p.domain}
                      </div>
                    </td>
                    <td>
                      <strong style={{ color: "#34d399" }}>
                        {p.market_share_pct}%
                      </strong>{" "}
                      (~{p.estimated_daily_new_listings.toLocaleString()}{" "}
                      tin/ngày)
                    </td>
                    <td>
                      <div>{p.technical_architecture.rendering}</div>
                      <span className="badge badge-blue">
                        Engine: {p.technical_architecture.recommended_engine}
                      </span>
                    </td>
                    <td>
                      <div style={{ color: "#fbbf24", fontWeight: 600 }}>
                        {p.historical_coverage_2021_2026.wayback_cdx_density}
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "#94a3b8" }}>
                        {p.historical_coverage_2021_2026.sitemap_xml_archive}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-green">
                        {p.runtime_health} ({p.efficiency_score}%)
                      </span>
                      <div
                        style={{
                          fontSize: "0.74rem",
                          color: "#94a3b8",
                          marginTop: "0.2rem",
                        }}
                      >
                        {p.execution_priority}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {roadmap.length > 0 && (
            <div
              className="rwd-grid-4"
              style={{ marginTop: "0.9rem", gap: "0.65rem" }}
            >
              {roadmap.map((ph, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "0.55rem",
                    padding: "0.7rem 0.8rem",
                    fontSize: "0.78rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.3rem",
                    }}
                  >
                    <strong style={{ color: "#34d399" }}>{ph.phase}</strong>
                    <span className="badge badge-green">
                      {ph.target_records.toLocaleString()} bản ghi
                    </span>
                  </div>
                  <div
                    style={{
                      fontWeight: 700,
                      color: "#f8fafc",
                      marginBottom: "0.35rem",
                    }}
                  >
                    {ph.title}
                  </div>
                  <code
                    style={{
                      display: "block",
                      background: "#1e293b",
                      padding: "0.35rem 0.5rem",
                      borderRadius: "0.35rem",
                      fontSize: "0.7rem",
                      color: "#fbbf24",
                      wordBreak: "break-all",
                    }}
                  >
                    {ph.command}
                  </code>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
