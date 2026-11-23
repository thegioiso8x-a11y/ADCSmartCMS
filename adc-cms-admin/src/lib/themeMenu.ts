import { loadMenu, type MenuItemNode } from '@/lib/publicData';

/**
 * themeMenu
 * ---------
 * Generic menu injection cho MỌI theme import vào hệ thống.
 *
 * Quy trình:
 *  1) Quét tất cả thẻ `<ul ... data-cms-menu="menuCode" ...>...</ul>` trong HTML đã render.
 *  2) Với mỗi menuCode, gọi API GET /api/menus?siteId=...&menuCode=...
 *  3) Nếu API có dữ liệu -> render cây menu đa cấp (đệ quy) và thay thế nội dung <ul>,
 *     giữ nguyên class của <ul>, <li> và <a> mẫu của chính theme (để không phá style).
 *  4) Nếu API rỗng (admin chưa tạo menu) -> GIỮ NGUYÊN HTML menu mẫu của theme (fallback).
 *
 * Không hardcode tên theme/menuCode: hoạt động với bất kỳ theme .zip nào.
 */

/** Escape ký tự HTML cho text node / attribute. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Lấy nhãn theo locale (mặc định 'vi'), fallback sang bất kỳ ngôn ngữ có sẵn. */
function resolveLabel(item: MenuItemNode, locale = 'vi'): string {
  const titles = item.titleLocales ?? {};
  return titles[locale] || titles.vi || titles.en || Object.values(titles)[0] || '—';
}

/** Xác định href của 1 mục menu (tổng quát, không hardcode content type). */
function resolveHref(item: MenuItemNode): string {
  // Ưu tiên customUrl đã lưu (đúng route thực tế), bất kể linkType.
  if (item.customUrl) return item.customUrl;
  if (item.linkType === 'entry' && item.targetEntryId) return `/${item.targetEntryId}`;
  if (item.linkType === 'collection') return '/';
  return '#';
}

/** Trích class của thẻ <a> mẫu đầu tiên trong HTML gốc của <ul> (giữ style theme). */
function extractLinkClass(innerHtml: string): string {
  const m = innerHtml.match(/<a\b[^>]*\bclass=(["'])([^"']*)\1/i);
  return m ? m[2] : '';
}

/** Trích class của thẻ <li> mẫu đầu tiên trong HTML gốc của <ul> (giữ style theme). */
function extractItemClass(innerHtml: string): string {
  const m = innerHtml.match(/<li\b[^>]*\bclass=(["'])([^"']*)\1/i);
  return m ? m[2] : '';
}

/** Trích class của <ul class="sub-menu"> mẫu (nếu theme có) để giữ style menu con. */
function extractSubMenuClass(innerHtml: string): string {
  const m = innerHtml.match(/<ul\b[^>]*\bclass=(["'])([^"']*)\1[^>]*>/i);
  return m ? m[2] : 'sub-menu';
}

/**
 * Render đệ quy cây menu đa cấp (2 cấp, 3 cấp...).
 * @param items Cây menu từ API.
 * @param linkClass Class của <a> (lấy từ theme).
 * @param itemClass Class của <li> (lấy từ theme).
 * @param subMenuClass Class của <ul> con (lấy từ theme).
 * @param level Cấp hiện tại (0 = gốc).
 */
function renderMenuTree(
  items: MenuItemNode[],
  linkClass: string,
  itemClass: string,
  subMenuClass: string,
  level: number,
  locale: string
): string {
  const visible = items.filter((i) => i.isVisible);
  if (visible.length === 0) return '';

  return visible
    .map((item) => {
      const hasChildren = Array.isArray(item.children) && item.children.length > 0;
      const href = escapeHtml(resolveHref(item));
      const label = escapeHtml(resolveLabel(item, locale));
      const target = item.targetBlank ? ' target="_blank" rel="noopener noreferrer"' : '';

      const liClass = hasChildren
        ? [itemClass, 'menu-item-has-children'].filter(Boolean).join(' ')
        : itemClass;
      const liClassAttr = liClass ? ` class="${escapeHtml(liClass)}"` : '';
      const aClassAttr = linkClass ? ` class="${escapeHtml(linkClass)}"` : '';

      const childHtml = hasChildren
        ? `<ul class="${escapeHtml(subMenuClass)}">${renderMenuTree(
            item.children,
            linkClass,
            itemClass,
            subMenuClass,
            level + 1,
            locale
          )}</ul>`
        : '';

      return `<li${liClassAttr}><a href="${href}"${aClassAttr}${target}>${label}</a>${childHtml}</li>`;
    })
    .join('');
}

/** Regex bắt thẻ <ul ... data-cms-menu="code" ...>...</ul> (không lồng <ul> cùng cấp). */
const MENU_UL_REGEX = /<ul\b([^>]*\bdata-cms-menu=(["'])([^"']+)\2[^>]*)>([\s\S]*?)<\/ul>/gi;

/**
 * Inject menu đa cấp vào HTML theme cho mọi `data-cms-menu`.
 * @param html HTML đã render (sau transformHtml).
 * @param locale Ngôn ngữ hiển thị.
 * @returns HTML đã thay thế menu (hoặc giữ nguyên nếu API rỗng).
 */
export async function injectThemeMenus(html: string, locale = 'vi'): Promise<string> {
  if (!html) return html;

  // 1) Thu thập tất cả menuCode xuất hiện trong HTML.
  const codes = new Set<string>();
  for (const m of html.matchAll(MENU_UL_REGEX)) {
    const code = m[3]?.trim();
    if (code) codes.add(code);
  }
  if (codes.size === 0) return html;

  // 2) Gọi API song song cho từng menuCode.
  const menuMap = new Map<string, MenuItemNode[]>();
  await Promise.all(
    Array.from(codes).map(async (code) => {
      const result = await loadMenu(code);
      if (result && Array.isArray(result.items) && result.items.length > 0) {
        menuMap.set(code, result.items);
      }
    })
  );

  if (menuMap.size === 0) return html; // Không có menu nào có dữ liệu -> giữ nguyên theme.

  // 3) Thay thế nội dung từng <ul data-cms-menu>.
  return html.replace(MENU_UL_REGEX, (full, _attrs: string, _q: string, code: string, inner: string) => {
    const items = menuMap.get(code.trim());
    if (!items) return full; // API rỗng -> giữ nguyên menu mẫu của theme.

    const linkClass = extractLinkClass(inner);
    const itemClass = extractItemClass(inner);
    const subMenuClass = extractSubMenuClass(inner);

    const rendered = renderMenuTree(items, linkClass, itemClass, subMenuClass, 0, locale);
    if (!rendered) return full;

    // Giữ nguyên thẻ <ul ...> mở đầu, chỉ thay phần inner.
    const openTagMatch = full.match(/^<ul\b[^>]*>/i);
    const openTag = openTagMatch ? openTagMatch[0] : '<ul>';
    return `${openTag}${rendered}</ul>`;
  });
}
