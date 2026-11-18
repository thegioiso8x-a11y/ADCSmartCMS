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

/** Lấy theme đang kích hoạt (theme mới nhất) + map templateKey -> template. */
export async function loadActiveTheme(): Promise<{
  theme: ThemeListItem | null;
  templates: Record<string, ThemeTemplate>;
}> {
  try {
    const res = await publicApi.get<ThemeListItem[]>('/api/themes');
    const themes = Array.isArray(res.data) ? res.data : [];
    const theme = themes.length > 0 ? themes[0] : null;
    if (!theme) return { theme: null, templates: {} };

    const tplRes = await publicApi.get<ThemeTemplate[]>(`/api/themes/${theme.id}/templates`);
    const list = Array.isArray(tplRes.data) ? tplRes.data : [];
    const templates: Record<string, ThemeTemplate> = {};
    for (const t of list) templates[t.templateKey] = t;
    return { theme, templates };
  } catch {
    return { theme: null, templates: {} };
  }
}

/** Lấy cây menu theo menuCode (mặc định 'primary_menu'). */
export async function loadMenu(menuCode = 'primary_menu'): Promise<MenuTreeResult | null> {
  try {
    const res = await publicApi.get<MenuTreeResult>('/api/menus', {
      params: { siteId: PUBLIC_SITE_ID, menuCode },
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
    }>(`/api/entries/${entryId}`, { params: { locale } });

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
