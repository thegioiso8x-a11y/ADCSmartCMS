/**
 * transformHtml
 * -------------
 * Rewrite URL tương đối trong HTML (Liquid template đã render) trước khi đưa vào
 * dangerouslySetInnerHTML, để trang Public không bị vỡ giao diện.
 *
 * 1) Đường dẫn tĩnh: `assets/...` -> `${assetsBaseUrl}/assets/...`
 *    (áp dụng cho href=", src=", url(' trong CSS inline).
 * 2) Link .html -> route Next.js tương ứng (TỔNG QUÁT, không hardcode tên trang).
 */

/** Chuẩn hóa base URL: bỏ dấu '/' ở cuối. */
function normalizeBase(assetsBaseUrl: string): string {
  return (assetsBaseUrl || '').trim().replace(/\/+$/, '');
}

/** Escape ký tự đặc biệt trong RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Chuyển 1 href nội bộ (.html) thành route public tổng quát.
 * Quy tắc (không hardcode tên trang):
 *  - index.html            -> /
 *  - page-<slug>.html      -> /<slug>
 *  - list-<slug>.html      -> /<slug>
 *  - detail-<slug>.html    -> /<slug>
 *  - <slug>.html           -> /<slug>
 *  - <slug> (không .html)  -> giữ nguyên
 */
function rewriteInternalHref(href: string, routePrefix: string): string {
    const trimmed = href.trim();

  // Bỏ qua URL tuyệt đối / anchor / mailto / tel / javascript.
  if (
    /^(https?:)?\/\//i.test(trimmed) ||
    trimmed.startsWith('#') ||
    /^(mailto|tel|javascript):/i.test(trimmed)
  ) {
    return href;
    }

  // Tách query/hash để giữ lại sau khi rewrite.
    const [pathPart, ...restParts] = trimmed.split(/(?=[?#])/);
    const suffix = restParts.join('');

  // Chỉ xử lý link .html (hoặc index).
  if (!/\.html?$/i.test(pathPart)) return href;
  const fileName = (pathPart.split('/').pop() ?? '').replace(/\.html?$/i, '');

  // index.html -> trang chủ.
  if (fileName.toLowerCase() === 'index') {
    return `${routePrefix}/${suffix}`;
    }

  // page-<slug> / list-<slug> / detail-<slug> -> /<slug>.
  const prefixed = fileName.match(/^(?:page|list|detail)-([a-zA-Z0-9_-]+)$/i);
  if (prefixed) {
    return `${routePrefix}/${prefixed[1]}${suffix}`;
  }

  // Các file .html nội bộ khác -> /<slug>.
  if (fileName.length > 0) {
    return `${routePrefix}/${fileName}${suffix}`;
  }

  return `${routePrefix}/${suffix}`;
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

  // ---------- 2) Link .html -> route (tổng quát) ----------
  // Chỉ xử lý trong thuộc tính href của thẻ <a>.
  out = out.replace(
    /<a\b([^>]*?)\bhref=(["'])([^"']+)\2([^>]*)>/gi,
    (match, before: string, quote: string, href: string, after: string) => {
      const target = rewriteInternalHref(href, routePrefix);
      if (target === href) return match;
      return `<a${before}href=${quote}${target}${quote}${after}>`;
    }
  );

  // ---------- 3) Dọn dẹp: bỏ thẻ <base> nếu template có (gây lệch đường dẫn) ----------
  out = out.replace(/<base\b[^>]*>/gi, '');

  // Tránh trùng lặp base nếu template đã có sẵn (idempotent).
  if (base) {
    const dup = new RegExp(`(${escapeRegExp(base)}){2,}`, 'g');
    out = out.replace(dup, base);
  }

  return out;
}

