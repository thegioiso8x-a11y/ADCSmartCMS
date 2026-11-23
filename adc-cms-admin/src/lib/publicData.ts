import publicApi, { PUBLIC_SITE_ID } from '@/lib/publicApi';

/**
 * Data loaders cho Public Website (Server-side).
 * Tất cả hàm đều "fail-soft": lỗi mạng/404 trả giá trị rỗng thay vì ném lỗi,
 * để trang public không bị trắng khi Backend chưa có dữ liệu.
 */

// ---------- Types (khớp DTO backend .NET) ----------

export interface ThemeListItem {
  id: string;
  themeCode: string;
  themeName: string;
  version: string;
  assetsBaseUrl: string;
  thumbnailUrl?: string | null;
  themeVariables: string;
  createdAt: string;
  isActive: boolean;
}

export interface ThemeTemplate {
  id: string;
  templateKey: string;
  templateType: string;
  compiledHtml: string;
  extractedSchema: string;
  updatedAt: string;
}

export interface MenuItemNode {
  id: string;
  parentId?: string | null;
  titleLocales: Record<string, string>;
  linkType: string;
  targetEntryId?: string | null;
  customUrl?: string | null;
  targetBlank: boolean;
  iconClass?: string | null;
  hierarchyPath?: string | null;
  sortOrder: number;
  isVisible: boolean;
  children: MenuItemNode[];
}

export interface MenuTreeResult {
  menu: { id: string; siteId: string; menuCode: string; menuName: string; isActive: boolean };
  items: MenuItemNode[];
}

export interface FilteredEntryItem {
  totalRecords: number;
  entryId: string;
  title?: string | null;
  slug?: string | null;
  baseData?: string | null;
  localizedData?: string | null;
  seoMeta?: string | null;
  publishedAt?: string | null;
  dynamicSortValue?: number | null;
}

export interface FilterEntriesResponse {
  items: FilteredEntryItem[];
  facets: unknown[];
}

export interface EntryBlock {
  id: string;
  entryId: string;
  locale: string;
  zoneKey: string;
  componentTypeId: string;
  blockData: string;
  sortOrder: number;
  isVisible: boolean;
}

// ---------- Helpers ----------

/** Parse an toàn chuỗi JSON object -> Record. */
export function parseJsonObject(raw?: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Header chống cache cho mọi request public (tránh Next.js/axios trả dữ liệu cũ khi đổi URL). */
const NO_CACHE_HEADERS = { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } as const;

/** Lấy theme đang kích hoạt (isActive === true) của site; fallback theme mới nhất nếu không có cờ. */
export async function getActiveTheme(siteId: string = PUBLIC_SITE_ID): Promise<ThemeListItem | null> {
  try {
    const res = await publicApi.get<ThemeListItem[]>('/api/themes', {
      params: { siteId },
      headers: NO_CACHE_HEADERS,
    });
    const themes = Array.isArray(res.data) ? res.data : [];
    if (themes.length === 0) return null;
    // Ưu tiên theme có isActive === true; nếu không có thì lấy theme mới nhất (phần tử đầu).
    return themes.find((t) => t.isActive === true) ?? themes[0];
  } catch {
    return null;
  }
}

/** Lấy danh sách templateKey của theme đang kích hoạt (dùng cho auto-matching route). */
export async function getAvailableTemplates(siteId: string = PUBLIC_SITE_ID): Promise<string[]> {
  const activeTheme = await getActiveTheme(siteId);
  if (!activeTheme) return [];
  try {
    const res = await publicApi.get<ThemeTemplate[]>(`/api/themes/${activeTheme.id}/templates`, {
      headers: NO_CACHE_HEADERS,
    });
    const list = Array.isArray(res.data) ? res.data : [];
    return list.map((t) => t.templateKey);
  } catch {
    return [];
  }
}

/** Lấy theme đang kích hoạt + map templateKey -> template (chỉ template của theme active). */
export async function loadActiveTheme(): Promise<{
  theme: ThemeListItem | null;
  templates: Record<string, ThemeTemplate>;
}> {
  try {
    const theme = await getActiveTheme(PUBLIC_SITE_ID);
    if (!theme) return { theme: null, templates: {} };

    const tplRes = await publicApi.get<ThemeTemplate[]>(`/api/themes/${theme.id}/templates`, {
      headers: NO_CACHE_HEADERS,
    });
    const list = Array.isArray(tplRes.data) ? tplRes.data : [];
    const templates: Record<string, ThemeTemplate> = {};
    for (const t of list) templates[t.templateKey] = t;
    return { theme, templates };
  } catch {
    return { theme: null, templates: {} };
  }
}

/** Một content type (khớp DTO backend GET /api/content-types). */
export interface ContentTypeItem {
  id: string;
  apiId: string;
  displayName: string;
  kind: string;
  routeSlug?: string | null;
}

/**
 * Lấy map route_slug (alias SEO) -> api_id từ danh sách content type của site.
 * VD: { 'tin-tuc': 'news', 'dich-vu': 'service' }.
 * Dùng để resolve route theo alias trước khi dò template (list_news/detail_news).
 */
export async function loadRouteSlugMap(siteId: string = PUBLIC_SITE_ID): Promise<Record<string, string>> {
  try {
    const res = await publicApi.get<ContentTypeItem[]>('/api/content-types', {
      params: { siteId },
      headers: NO_CACHE_HEADERS,
    });
    const list = Array.isArray(res.data) ? res.data : [];
    const map: Record<string, string> = {};
    for (const ct of list) {
      if (ct.routeSlug && ct.apiId) map[ct.routeSlug.toLowerCase()] = ct.apiId;
    }
    return map;
  } catch {
    return {};
  }
}

/** Lấy cây menu theo menuCode (mặc định 'primary_menu'). */
export async function loadMenu(menuCode = 'primary_menu'): Promise<MenuTreeResult | null> {
  try {
    const res = await publicApi.get<MenuTreeResult>('/api/menus', {
      params: { siteId: PUBLIC_SITE_ID, menuCode },
      headers: NO_CACHE_HEADERS,
    });
    return res.data ?? null;
  } catch {
    return null;
  }
}

/** Lấy danh sách entry theo content type (null = tất cả). */
export async function loadEntries(
  contentTypeApiId: string | null,
  pageIndex = 1,
  pageSize = 20,
  keyword?: string
): Promise<FilterEntriesResponse> {
  try {
    const res = await publicApi.get<FilterEntriesResponse>('/api/entries/filter', {
      params: {
        siteId: PUBLIC_SITE_ID,
        contentTypeApiId: contentTypeApiId || undefined,
        keyword: keyword || undefined,
        pageIndex,
        pageSize,
      },
      headers: NO_CACHE_HEADERS,
    });
    return { items: res.data?.items ?? [], facets: res.data?.facets ?? [] };
  } catch {
    return { items: [], facets: [] };
  }
}

/** Lấy chi tiết 1 entry theo id + locale. */
export async function loadEntryDetail(entryId: string, locale = 'vi'): Promise<FilteredEntryItem | null> {
  try {
    const res = await publicApi.get<{
      id: string;
      title?: string | null;
      slug?: string | null;
      baseData?: string | null;
      localizedData?: string | null;
      status?: string | null;
    }>(`/api/entries/${entryId}`, { params: { locale }, headers: NO_CACHE_HEADERS });

    const d = res.data;
    if (!d?.id) return null;
    return {
      totalRecords: 1,
      entryId: d.id,
      title: d.title ?? null,
      slug: d.slug ?? null,
      baseData: d.baseData ?? null,
      localizedData: d.localizedData ?? null,
      seoMeta: null,
      publishedAt: null,
      dynamicSortValue: null,
    };
  } catch {
    return null;
  }
}

/** Lấy danh sách block của 1 entry theo locale. */
export async function loadEntryBlocks(entryId: string, locale = 'vi'): Promise<EntryBlock[]> {
  try {
    const res = await publicApi.get<EntryBlock[]>(`/api/entries/${entryId}/blocks`, {
      params: { locale },
      headers: NO_CACHE_HEADERS,
    });
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

/** Tìm entry theo slug trong 1 content type (dùng cho route detail). */
export async function findEntryBySlug(
  contentTypeApiId: string,
  slug: string
): Promise<FilteredEntryItem | null> {
  const { items } = await loadEntries(contentTypeApiId, 1, 100);
  return items.find((e) => e.slug === slug) ?? null;
}
