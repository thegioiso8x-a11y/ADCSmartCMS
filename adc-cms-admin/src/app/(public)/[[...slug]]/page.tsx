import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { renderLiquid } from '@/lib/liquid';
import { transformHtml } from '@/lib/transformHtml';
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
 * Public Website - Dynamic Route
 * ------------------------------
 * Bắt mọi đường dẫn: /, /tin-tuc, /tin-tuc/[slug], /dich-vu, ...
 * Render Liquid Template (cms_theme_templates) với dữ liệu từ Backend.
 *
 * Quy ước templateKey:
 *  - Trang chủ (slug rỗng)      -> 'page_home'
 *  - Danh sách tin tức          -> 'list_news'
 *  - Chi tiết tin tức           -> 'detail_news'
 *  - Trang tĩnh khác            -> 'page_{slug}'
 */

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

/** Chọn templateKey theo slug. */
function resolveTemplateKey(slug: string[]): string {
  if (slug.length === 0) return 'page_home';
  if (slug[0] === 'tin-tuc' && slug.length === 1) return 'list_news';
  if (slug[0] === 'tin-tuc' && slug.length >= 2) return 'detail_news';
  return `page_${slug.join('_')}`;
}

/** Lấy template theo key; fallback layout_master / page_home nếu thiếu. */
function pickTemplate(templates: Record<string, ThemeTemplate>, key: string): ThemeTemplate | null {
  return templates[key] ?? templates['page_home'] ?? templates['layout_master'] ?? null;
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
  const key = resolveTemplateKey(slug);

  if (key === 'detail_news' && slug.length >= 2) {
    const entry = await findEntryBySlug('news', slug[1]);
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
  const templateKey = resolveTemplateKey(slug);

  // 1) Theme + templates + menu (song song để giảm thời gian chờ).
  const [{ theme, templates }, menu] = await Promise.all([loadActiveTheme(), loadMenu('primary_menu')]);

  const template = pickTemplate(templates, templateKey);
  const assetsBaseUrl = theme?.assetsBaseUrl ?? '';

  // 2) Chuẩn bị dữ liệu theo loại trang.
  let pageData: Record<string, unknown> = {};
  let formFields: PublicFormField[] = [];
  let formCode = '';

  if (templateKey === 'page_home') {
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
  } else if (templateKey === 'list_news') {
    // Danh sách tin tức.
    const { items } = await loadEntries('news', 1, 20);
    pageData = {
      page_title: 'Tin tức',
      total: items.length > 0 ? items[0].totalRecords : 0,
      entries: items.map(entryToLiquidData),
    };
  } else if (templateKey === 'detail_news') {
    // Chi tiết tin tức: slug[1] là slug bài viết.
    const entry = await findEntryBySlug('news', slug[1]);
    pageData = {
      page_title: entry?.title ?? 'Không tìm thấy bài viết',
      entry: entry ? entryToLiquidData(entry) : null,
    };
  } else {
    // Trang tĩnh khác: thử tìm entry theo slug.
    const entry = await findEntryBySlug(slug[0], slug[slug.length - 1]);
    pageData = {
      page_title: entry?.title ?? slug.join(' / '),
      entry: entry ? entryToLiquidData(entry) : null,
    };
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

  const rawHtml = template ? await renderLiquid(template.compiledHtml, liquidData) : '';
  // Rewrite URL tương đối (assets/, *.html) trước khi render ra DOM.
  const html = transformHtml(rawHtml, assetsBaseUrl);

  return (
    <div className="min-h-screen bg-white">
      {/* Header: menu đa cấp render từ API */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-40">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-6">
          <Link href="/" className="text-lg font-bold text-slate-800">
            ADC Smart CMS
          </Link>
          <PublicMenu items={(menu as MenuTreeResult | null)?.items ?? []} locale="vi" />
        </div>
      </header>

      {/* Nội dung render từ Liquid Template */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        {template ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
            <h1 className="text-lg font-semibold mb-2">Chưa có giao diện</h1>
            <p className="text-sm">
              Chưa tìm thấy theme/template cho trang này. Vui lòng import theme trong Admin
              (Quản lý Giao diện) rồi thử lại.
            </p>
          </div>
        )}

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
