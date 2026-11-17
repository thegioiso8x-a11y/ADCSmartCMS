// Kiểu dữ liệu dùng chung cho các trang Dashboard (khớp DTO backend .NET).

/** GET /api/content-types -> ContentTypeDto */
export interface ContentType {
  id: string;
  apiId: string;
  displayName: string;
  kind: string;
  /** Backend hiện chưa trả về; optional để UI hiển thị an toàn. */
  isLocalized?: boolean;
}

/** GET /api/content-types/{apiId}/fields -> FieldDefinitionDto */
export interface FieldDefinition {
  /** Backend hiện chưa trả về id trong danh sách; optional để UI hiển thị an toàn. */
  id?: string;
  fieldKey: string;
  displayLabel: string;
  fieldType: string;
  isRequired: boolean;
  /** Backend hiện chưa trả về; optional để UI hiển thị an toàn. */
  isFilterable?: boolean;
  isLocalized?: boolean;
  /** Chuỗi JSON validation_rules (min/max/pattern/...) nếu backend trả về. */
  validationRules?: string | null;
}

/** Một dòng trong GET /api/entries/filter -> FilteredEntryItem */
export interface FilteredEntry {
  totalRecords: number;
  entryId: string;
  title?: string | null;
  slug?: string | null;
  baseData?: string | null;
  localizedData?: string | null;
  seoMeta?: string | null;
  publishedAt?: string | null;
  dynamicSortValue?: number | null;
  /** Backend SP không trả status; optional để UI hiển thị an toàn. */
  status?: string | null;
}

/** Kết quả GET /api/entries/filter */
export interface FilterEntriesResponse {
  items: FilteredEntry[];
  facets: unknown[];
}

/** GET /api/menus -> MenuDto */
export interface Menu {
  id: string;
  siteId: string;
  menuCode: string;
  menuName: string;
  isActive: boolean;
  createdAt: string;
}

/** Một mục menu phẳng (bảng cms_menu_items). */
export interface MenuItem {
  id: string;
  menuId: string;
  parentId?: string | null;
  titleLocales: string;
  linkType: string;
  targetEntryId?: string | null;
  customUrl?: string | null;
  targetBlank: boolean;
  iconClass?: string | null;
  hierarchyPath?: string | null;
  sortOrder: number;
  isVisible: boolean;
}

/** Node trong cây menu trả về từ GET /api/menus. */
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

/** Kết quả GET /api/menus */
export interface MenuTreeResponse {
  menu: Menu;
  items: MenuItemNode[];
}

/** GET /api/media/folders -> MediaFolderDto */
export interface MediaFolder {
  id: string;
  siteId: string;
  parentId?: string | null;
  folderName: string;
  folderPath: string;
  createdAt: string;
}

/** GET /api/media/assets -> MediaAssetDto */
export interface MediaAsset {
  id: string;
  siteId: string;
  folderId?: string | null;
  fileName: string;
  originalUrl: string;
  mimeType: string;
  fileExt: string;
  fileSizeBytes: number;
  width?: number | null;
  height?: number | null;
  thumbUrl?: string | null;
  webpUrl?: string | null;
  avifUrl?: string | null;
  focalPoint: string;
  altTextLocales: string;
  fileHash?: string | null;
  uploadedBy?: string | null;
  createdAt: string;
}

