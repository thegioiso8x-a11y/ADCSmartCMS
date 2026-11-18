/**
 * transformHtml
 * -------------
 * Rewrite URL tương đối trong HTML (Liquid template đã render) trước khi đưa vào
 * dangerouslySetInnerHTML, để trang Public không bị vỡ giao diện.
 *
 * 1) Đường dẫn tĩnh: `assets/...` -> `${assetsBaseUrl}/assets/...`
 *    (áp dụng cho href=", src=", url(' trong CSS inline).
 * 2) Link .html -> route Next.js tương ứng.
 */

/** Map tên file .html -> route public. */
const HTML_ROUTE_MAP: Record<string, string> = {
  'index.html': '/',
  'list-news.html': '/tin-tuc',
  'list-service.html': '/dich-vu',
  'page-gioi-thieu.html': '/gioi-thieu',
  'page-lien-he.html': '/lien-he',
  'detail-news.html': '/tin-tuc/chi-tiet',
  'detail-service.html': '/dich-vu/chi-tiet',
};

/** Chuẩn hóa base URL: bỏ dấu '/' ở cuối. */
function normalizeBase(assetsBaseUrl: string): string {
  return (assetsBaseUrl || '').trim().replace(/\/+$/, '');
}

/** Escape ký tự đặc biệt trong RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrite HTML: thay đường dẫn tĩnh + link .html.
 * @param html HTML đã render từ Liquid.
 * @param assetsBaseUrl URL gốc tài nguyên (VD https://cdn.example.com/themes/tech_store).
 * @param routePrefix Tiền tố route (mặc định '').
 */
export function transformHtml(html: string, assetsBaseUrl: string, routePrefix = ''): string {
  if (!html) return '';

  let out = html;
  const base = normalizeBase(assetsBaseUrl);

  // ---------- 1) Đường dẫn tĩnh ----------
  if (base) {
    // href="assets/...  |  src="assets/...  |  href='assets/...  |  src='assets/...
    out = out.replace(/(href|src)=(["'])assets\//g, (_m, attr: string, quote: string) => {
      return `${attr}=${quote}${base}/assets/`;
    });

    // url('assets/...')  |  url("assets/...")  |  url(assets/...)
    out = out.replace(/url\(\s*(['"]?)assets\//g, (_m, quote: string) => {
      return `url(${quote}${base}/assets/`;
    });

    // srcset="assets/...  (responsive images)
    out = out.replace(/srcset=(["'])([^"']*?)assets\//g, (_m, quote: string, prefix: string) => {
      return `srcset=${quote}${prefix}${base}/assets/`;
    });
  }

  // ---------- 2) Link .html -> route ----------
  // Chỉ xử lý trong thuộc tính href của thẻ <a>.
  out = out.replace(/<a\b([^>]*?)\bhref=(["'])([^"']+)\2([^>]*)>/gi, (match, before: string, quote: string, href: string, after: string) => {
    const trimmed = href.trim();

    // Bỏ qua URL tuyệt đối / anchor / mailto / tel.
    if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('#') || /^(mailto|tel|javascript):/i.test(trimmed)) {
      return match;
    }

    // Lấy phần path (bỏ query/hash) để tra map.
    const [pathPart, ...restParts] = trimmed.split(/(?=[?#])/);
    const suffix = restParts.join('');
    const fileName = pathPart.split('/').pop() ?? '';

    const mapped = HTML_ROUTE_MAP[fileName];
    if (mapped) {
      const target = `${routePrefix}${mapped}${suffix}`;
      return `<a${before}href=${quote}${target}${quote}${after}>`;
    }

    // Các file .html khác: bỏ đuôi .html và chuyển thành route tương đối.
    if (/\.html?$/i.test(pathPart)) {
      const withoutExt = pathPart.replace(/\.html?$/i, '');
      const slug = withoutExt.split('/').pop() ?? '';
      const target = slug && slug !== 'index' ? `${routePrefix}/${slug}${suffix}` : `${routePrefix}/${suffix}`;
      return `<a${before}href=${quote}${target}${quote}${after}>`;
    }

    return match;
  });

  // ---------- 3) Dọn dẹp: bỏ thẻ <base> nếu template có (gây lệch đường dẫn) ----------
  out = out.replace(/<base\b[^>]*>/gi, '');

  // Tránh trùng lặp base nếu template đã có sẵn (idempotent).
  if (base) {
    const dup = new RegExp(`(${escapeRegExp(base)}){2,}`, 'g');
    out = out.replace(dup, base);
  }

  return out;
}
