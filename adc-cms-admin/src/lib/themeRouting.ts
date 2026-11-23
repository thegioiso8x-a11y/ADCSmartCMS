import type { ThemeTemplate } from '@/lib/publicData';

/**
 * themeRouting
 * ------------
 * Generic route matcher + layout composition cho MỌI theme.
 *
 * - resolveTemplateKey: dò templateKey phù hợp với slug (page_/list_/detail_),
 *   chuẩn hóa '-' <-> '_' và số ít/số nhiều (service/services, news).
 * - composeWithLayout: ghép phần ruột <main> của template trang con vào giữa
 *   Header và Footer của layout_master (giữ <head>, CSS, Header, Footer của theme).
 */

/** Chuẩn hóa 1 chuỗi slug/key: lowercase, '-' -> '_'. */
function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/-/g, '_');
}

/** Sinh các biến thể số ít/số nhiều của 1 key (đã normalize). */
function pluralVariants(key: string): string[] {
  const set = new Set<string>([key]);
  if (key.endsWith('s')) set.add(key.slice(0, -1)); // services -> service
  else set.add(`${key}s`); // service -> services
  if (key.endsWith('es')) set.add(key.slice(0, -2)); // categories -> categorie (hiếm)
  return Array.from(set);
}

/**
 * Dò templateKey phù hợp với slug.
 * @param slug Mảng segment của URL (rỗng = trang chủ).
 * @param templates Map templateKey -> template của theme đang active.
 * @param routeSlugMap Map route_slug (alias SEO) -> api_id. VD { 'tin-tuc': 'news' }.
 *        Nếu segment đầu khớp route_slug, dùng api_id tương ứng để dò template (list_news/detail_news).
 * @returns templateKey khớp, hoặc null nếu không tìm thấy.
 */
export function resolveTemplateKey(
  slug: string[],
  templates: Record<string, ThemeTemplate>,
  routeSlugMap: Record<string, string> = {}
): string | null {
  // 1) Trang chủ.
  if (slug.length === 0) {
    if (templates['page_home']) return 'page_home';
    if (templates['layout_master']) return 'layout_master';
    return null;
  }

  // 1.5) Alias SEO: nếu segment đầu là route_slug -> dùng api_id thật để dò template.
  const rawFirst = normalizeKey(slug[0]);
  const aliasedFirst = routeSlugMap[rawFirst] ?? routeSlugMap[slug[0]] ?? rawFirst;

  const first = normalizeKey(aliasedFirst);
  const last = normalizeKey(slug[slug.length - 1]);
  const isDetail = slug.length >= 2;

  // 2) Ứng viên theo thứ tự ưu tiên (detail trước nếu URL có >= 2 segment).
  const candidates: string[] = [];
  const bases = pluralVariants(first);

  if (isDetail) {
    for (const b of bases) candidates.push(`detail_${b}`);
  }
  for (const b of bases) candidates.push(`list_${b}`);
  for (const b of bases) candidates.push(`page_${b}`);

  // 3) Khớp trực tiếp theo tên (đã normalize).
  for (const c of candidates) {
    if (templates[c]) return c;
  }

  // 4) Khớp mờ: templateKey đã normalize trùng với bất kỳ ứng viên nào.
  const normalizedMap = new Map<string, string>();
  for (const key of Object.keys(templates)) normalizedMap.set(normalizeKey(key), key);
  for (const c of candidates) {
    const hit = normalizedMap.get(normalizeKey(c));
    if (hit) return hit;
  }

  // 5) Fallback: dùng segment cuối (detail) hoặc segment đầu.
  const fallbackBase = isDetail ? last : first;
  for (const b of pluralVariants(fallbackBase)) {
    for (const prefix of ['detail_', 'list_', 'page_']) {
      const key = `${prefix}${b}`;
      if (templates[key]) return key;
      const hit = normalizedMap.get(normalizeKey(key));
      if (hit) return hit;
    }
  }

  return null;
}

/** Trích nội dung bên trong thẻ <main>...</main> (nếu có), ngược lại trả toàn bộ body. */
function extractMainInner(html: string): string | null {
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) return mainMatch[1];

  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) return bodyMatch[1];

  return null;
}

/**
 * Ghép template trang con vào layout_master.
 * Lấy ruột <main> của child, thay vào vị trí <main> của layout_master.
 * Nếu layout_master không có <main>, chèn vào trước </body>.
 * @param layoutHtml HTML của layout_master.
 * @param childHtml HTML của template trang con.
 * @returns HTML đã ghép (giữ head/CSS/header/footer của layout).
 */
export function composeWithLayout(layoutHtml: string, childHtml: string): string {
  if (!layoutHtml) return childHtml;
  if (!childHtml) return layoutHtml;

  const childInner = extractMainInner(childHtml);
  if (childInner === null) return layoutHtml;

  // Thay ruột <main> của layout bằng ruột <main> của child.
  if (/<main\b[^>]*>[\s\S]*?<\/main>/i.test(layoutHtml)) {
    return layoutHtml.replace(/(<main\b[^>]*>)[\s\S]*?(<\/main>)/i, (_m, open: string, close: string) => {
      return `${open}${childInner}${close}`;
    });
  }

  // Layout không có <main>: chèn trước </body>.
  if (/<\/body>/i.test(layoutHtml)) {
    return layoutHtml.replace(/<\/body>/i, `${childInner}</body>`);
  }

  return layoutHtml;
}
