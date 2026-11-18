import { Liquid } from 'liquidjs';

/**
 * Liquid renderer (Server-side).
 * ------------------------------
 * Dùng liquidjs để render template Liquid (compiled_html từ cms_theme_templates) với dữ liệu JSON.
 * - `outputEscape: 'escape'` để tránh XSS từ dữ liệu người dùng nhập.
 * - `strictVariables: false` để template thiếu biến không làm crash trang public.
 */
const engine = new Liquid({
  outputEscape: 'escape',
  strictVariables: false,
  strictFilters: false,
  cache: false,
});

/** Render template Liquid với dữ liệu; trả HTML string. */
export async function renderLiquid(template: string, data: Record<string, unknown>): Promise<string> {
  if (!template) return '';
  try {
    return await engine.parseAndRender(template, data);
  } catch (err: unknown) {
    const e = err as { message?: string };
    // Không ném lỗi ra ngoài: trang public vẫn hiển thị phần còn lại thay vì trắng trang.
    return `<div style="padding:16px;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;border-radius:8px;font-family:sans-serif">
      <strong>Lỗi render template:</strong> ${e?.message ?? 'Không xác định'}
    </div>`;
  }
}
