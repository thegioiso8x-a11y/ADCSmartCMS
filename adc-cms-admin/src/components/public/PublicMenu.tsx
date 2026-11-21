import React from 'react';
import type { MenuItemNode } from '@/lib/publicData';

/**
 * PublicMenu
 * ----------
 * Render cây menu đa cấp (từ GET /api/menus) thành HTML <ul>/<li>.
 * Server Component (không có state) - dùng được trong app/(public).
 */

/** Xác định href của 1 mục menu. */
function resolveHref(item: MenuItemNode): string {
  if (item.linkType === 'custom' && item.customUrl) return item.customUrl;
  if (item.linkType === 'entry' && item.targetEntryId) return `/tin-tuc/${item.targetEntryId}`;
  if (item.linkType === 'collection') return '/tin-tuc';
  return '#';
}

/** Lấy nhãn theo locale (mặc định 'vi'). */
function resolveLabel(item: MenuItemNode, locale = 'vi'): string {
  const titles = item.titleLocales ?? {};
  return titles[locale] || titles.vi || titles.en || Object.values(titles)[0] || '—';
}

function MenuList({ items, locale, level }: { items: MenuItemNode[]; locale: string; level: number }) {
  // Sắp xếp theo sortOrder tăng dần (áp dụng cho cả cấp 1 và đệ quy menu con).
  const visible = items
    .filter((i) => i.isVisible)
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  if (visible.length === 0) return null;

  return (
    <ul className={level === 0 ? 'flex flex-wrap items-center gap-6' : 'mt-2 space-y-1 pl-4'}>
      {visible.map((item) => (
        <li key={item.id} className={level === 0 ? 'relative' : ''}>
          <a
            href={resolveHref(item)}
            target={item.targetBlank ? '_blank' : undefined}
            rel={item.targetBlank ? 'noopener noreferrer' : undefined}
            className={
              level === 0
                ? 'text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors'
                : 'text-sm text-slate-600 hover:text-blue-600 transition-colors'
            }
          >
            {resolveLabel(item, locale)}
          </a>
          {item.children?.length ? (
            <MenuList items={item.children} locale={locale} level={level + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default function PublicMenu({
  items,
  locale = 'vi',
}: {
  items: MenuItemNode[];
  locale?: string;
}) {
  if (!items || items.length === 0) return null;
  return (
    <nav aria-label="Main navigation">
      <MenuList items={items} locale={locale} level={0} />
    </nav>
  );
}
