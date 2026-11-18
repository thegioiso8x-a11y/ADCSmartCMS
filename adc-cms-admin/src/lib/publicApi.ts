import axios from 'axios';

/**
 * Public API client (Server-side only).
 * -------------------------------------
 * Dùng cho Public Website (app/(public)) để gọi Backend .NET.
 * KHÔNG dùng instance `@/lib/api` (instance đó gắn Bearer token của Admin + redirect /login khi 401).
 *
 * Lưu ý: các endpoint public cần dữ liệu (menus, themes/templates) đang yêu cầu JWT ở Backend.
 * Vì vậy client này đính kèm token tùy chọn từ ENV `PUBLIC_API_TOKEN` (nếu có) để render được.
 */

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5088').replace(/\/+$/, '');

/** Site mặc định cho public website (khớp siteId đang dùng trong Admin). */
export const PUBLIC_SITE_ID =
  process.env.NEXT_PUBLIC_SITE_ID || '2FD0078F-0043-4083-B34F-4BDF7BF6A604';

const publicApi = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

publicApi.interceptors.request.use((config) => {
  const token = process.env.PUBLIC_API_TOKEN;
  if (token && config.headers) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Ghép URL đầy đủ cho asset media (đường dẫn tương đối /uploads/...). */
export function fullAssetUrl(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

export default publicApi;
