import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { renderLiquid } from '@/lib/liquid';
import { transformHtml } from '@/lib/transformHtml';
import { injectThemeMenus } from '@/lib/themeMenu';
import { resolveTemplateKey, composeWithLayout } from '@/lib/themeRouting';
import {
  loadActiveTheme,
  loadMenu,
  loadEntries,
  loadEntryBlocks,
  findEntryBySlug,
  parseJsonObject,
  type FilteredEntryItem,
  type MenuTreeResult,
  type ThemeTemplate,
} from '@/lib/publicData';
import PublicMenu from '@/components/public/PublicMenu';
import PublicForm, { type PublicFormField } from '@/components/public/PublicForm';

/**
 * Public Website - Dynamic Route (Generic Theme Renderer)
 * -------------------------------------------------------
 * Bắt mọi đường dẫn: /, /tin-tuc, /tin-tuc/[slug], /dich-vu, ...
 * Render Liquid Template (cms_theme_templates) với dữ liệu từ Backend.
 *
 * Hoạt động TỔNG QUÁT với mọi theme import vào hệ thống:
 *  - Dò templateKey theo slug (page_/list_/detail_, chuẩn hóa '-'/'_' + số ít/số nhiều).
 *  - Trang con: ghép ruột <main> vào layout_master (giữ head/CSS/header/footer).
 *  - Inject menu đa cấp cho MỌI <ul data-cms-menu="..."> (fallback giữ menu mẫu của theme).
 *  - Rewrite link .html -> route nội bộ (tổng quát).
 */

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

/** Lấy template theo key; fallback layout_master / page_home nếu thiếu. */
function pickTemplate(templates: Record<string, ThemeTemplate>, key: string | null): ThemeTemplate | null {
  if (key && templates[key]) return templates[key];
  return templates['page_home'] ?? templates['layout_master'] ?? null;
}

/** Chuyển entry -> object phẳng cho Liquid (base_data + localized_data + title/slug). */
function entryToLiquidData(entry: FilteredEntryItem): Record<string, unknown> {
  return {
    id: entry.entryId,
    title: entry.title ?? '',
    slug: entry.slug ?? '',
    published_at: entry.publishedAt ?? '',
    ...parseJsonObject(entry.baseData),
    ...parseJsonObject(entry.localizedData),
  };
}

/** Sinh metadata SEO từ dữ liệu entry (nếu có). */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug = [] } = await params;

  // Chi tiết: slug có >= 2 segment -> segment cuối là slug bài viết.
  if (slug.length >= 2) {
    const entry = await findEntryBySlug(slug[0], slug[slug.length - 1]);
    if (entry) {
      const seo = parseJsonObject(entry.seoMeta);
      const title = (seo.meta_title as string) || entry.title || 'ADC Smart CMS';
      const description = (seo.meta_description as string) || '';
      return { title, description };
    }
  }

  return { title: 'ADC Smart CMS' };
}

export default async function PublicPage({ params }: PageProps) {
  const { slug = [] } = await params;
  // 1) Theme + templates + menu (song song để giảm thời gian chờ).
  const [{ theme, templates }, menu] = await Promise.all([loadActiveTheme(), loadMenu('primary_menu')]);

  const templateKey = resolveTemplateKey(slug, templates);
  const template = pickTemplate(templates, templateKey);
  const assetsBaseUrl = theme?.assetsBaseUrl ?? '';

  const isHome = slug.length === 0;
  const isDetail = slug.length >= 2;
  const isList = slug.length === 1;

  // 2) Chuẩn bị dữ liệu theo loại trang (tổng quát, không hardcode content type).
  let pageData: Record<string, unknown> = {};
  let formFields: PublicFormField[] = [];
  let formCode = '';

  if (isHome) {
    // Trang chủ: lấy các block home_hero, home_services từ entry mới nhất.
    const { items } = await loadEntries(null, 1, 1);
    const firstEntry = items[0];
    let blocks: Record<string, unknown>[] = [];
    if (firstEntry) {
      const rawBlocks = await loadEntryBlocks(firstEntry.entryId);
      blocks = rawBlocks
        .filter((b) => b.isVisible)
        .map((b) => ({ zone_key: b.zoneKey, sort_order: b.sortOrder, ...parseJsonObject(b.blockData) }));
    }
    pageData = {
      page_title: 'Trang chủ',
      blocks,
      home_hero: blocks.find((b) => b.zone_key === 'home_hero') ?? {},
      home_services: blocks.find((b) => b.zone_key === 'home_services') ?? {},
    };
  } else if (isList) {
    // Danh sách: dùng segment đầu làm content type api_id.
    const contentType = slug[0];
    const { items } = await loadEntries(contentType, 1, 20);
    pageData = {
      page_title: contentType,
      total: items.length > 0 ? items[0].totalRecords : 0,
      entries: items.map(entryToLiquidData),
    };
  } else if (isDetail) {
    // Chi tiết: segment đầu = content type, segment cuối = slug bài viết.
    const contentType = slug[0];
    const entry = await findEntryBySlug(contentType, slug[slug.length - 1]);
    pageData = {
      page_title: entry?.title ?? 'Không tìm thấy bài viết',
      entry: entry ? entryToLiquidData(entry) : null,
    };
  } else {
    pageData = { page_title: slug.join(' / ') };
  }
  // 3) Form liên hệ (nếu template khai báo data-cms-form trong extracted_schema).
  if (template) {
    const schema = parseJsonObject(template.extractedSchema);
    const forms = schema.forms;
    if (Array.isArray(forms) && forms.length > 0) {
      const first = forms[0] as Record<string, unknown>;
      formCode = typeof first.form_code === 'string' ? first.form_code : '';
      const rawFields = Array.isArray(first.fields) ? first.fields : [];
      formFields = rawFields
        .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === 'object')
        .map((f) => ({
          name: String(f.name ?? ''),
          label: String(f.label ?? f.name ?? ''),
          type: (f.type === 'email' || f.type === 'tel' || f.type === 'textarea' ? f.type : 'text') as
            | 'text'
            | 'email'
            | 'tel'
            | 'textarea',
          required: Boolean(f.required),
        }))
        .filter((f) => f.name.length > 0);
    }
  }

  // 4) Render Liquid.
  const liquidData: Record<string, unknown> = {
    ...pageData,
    menu: menu?.items ?? [],
    menu_name: menu?.menu?.menuName ?? '',
    site_id: process.env.NEXT_PUBLIC_SITE_ID || '',
    current_path: `/${slug.join('/')}`,
  };

  let rawHtml = template ? await renderLiquid(template.compiledHtml, liquidData) : '';

  // 5) Trang con: ghép ruột <main> của template con vào layout_master (giữ head/CSS/header/footer).
  const layout = templates['layout_master'];
  if (template && layout && template.templateKey !== 'layout_master' && !isHome) {
    const layoutHtml = await renderLiquid(layout.compiledHtml, liquidData);
    rawHtml = composeWithLayout(layoutHtml, rawHtml);
  }
  // 6) Rewrite URL tương đối (assets/, *.html) trước khi render ra DOM.
  let html = transformHtml(rawHtml, assetsBaseUrl);

  // 7) Inject menu đa cấp cho MỌI <ul data-cms-menu="..."> (fallback giữ menu mẫu của theme).
  html = await injectThemeMenus(html, 'vi');

  // Khi đã có theme/template: render DUY NHẤT nội dung theme full-width.
  // KHÔNG render header hệ thống ("ADC Smart CMS") và KHÔNG bọc trong max-w-* / container
  // (tránh giao diện theme bị co hẹp sang trái, thừa khoảng trắng bên phải).
  if (template) {
    return (
      <div className="w-full min-h-screen">
          <div dangerouslySetInnerHTML={{ __html: html }} />
        {/* Form thu thập khách hàng (nếu template khai báo) */}
        {formCode && formFields.length > 0 ? (
          <section className="mx-auto max-w-6xl px-4 py-8 border-t border-slate-200">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Liên hệ với chúng tôi</h2>
            <PublicForm formCode={formCode} fields={formFields} />
          </section>
        ) : null}
      </div>
  );
}

  // Fallback: chưa có theme -> hiển thị header hệ thống + thông báo.
  return (
    <div className="min-h-screen bg-white">
      {/* Header: menu đa cấp render từ API (chỉ dùng khi chưa có theme) */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-40">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-6">
          <Link href="/" className="text-lg font-bold text-slate-800">
            ADC Smart CMS
          </Link>
          <PublicMenu items={(menu as MenuTreeResult | null)?.items ?? []} locale="vi" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
          <h1 className="text-lg font-semibold mb-2">Chưa có giao diện</h1>
          <p className="text-sm">
            Chưa tìm thấy theme/template cho trang này. Vui lòng import theme trong Admin
            (Quản lý Giao diện) rồi thử lại.
          </p>
        </div>

        {/* Form thu thập khách hàng (nếu template khai báo) */}
        {formCode && formFields.length > 0 ? (
          <section className="mt-10 border-t border-slate-200 pt-8">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Liên hệ với chúng tôi</h2>
            <PublicForm formCode={formCode} fields={formFields} />
          </section>
        ) : null}
      </main>
    </div>
  );
}

