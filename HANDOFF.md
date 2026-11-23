# DỰ ÁN: ADC SMART & COMPOSABLE CMS - HANDOFF V9.0

## PHẦN 1: QUY TẮC GIAO TIẾP TỐI ƯU TOKEN (RULES V2.1)
1. KHÔNG IN CODE DÀI: Dùng tool/bash tạo file. Chỉ in diff ≤10 dòng.
2. BÁO CÁO NGẮN: `[TRẠNG THÁI]`, `[ĐÃ LÀM]`, `[SỐ LẦN BUILD]`, `[GHI CHÚ]`.
3. TERMINAL: KHÔNG TỰ CHẠY. Build BE: `dotnet build ./AdcSmartCms.sln -v q --nologo`.
4. AI IDE: Tuân thủ `.cursorrules` (cấm `any`, dùng `unknown` + type guard, `MenuProps`).
5. VERIFY-FIRST: Mọi task sửa lỗi phải VERIFY (đọc code, in file:line) trước khi FIX.

## PHẦN 2: CẤU TRÚC REPO (CHÍNH XÁC)
ADCSmartCMS/
├── AdcSmartCms.sln
├── data/data_SmartCMS.sql
├── src/AdcSmartCms.Api/ # Minimal API
├── src/AdcSmartCms.Application/ # DTOs, Services
├── src/AdcSmartCms.Domain/
├── src/AdcSmartCms.Infrastructure/# Dapper Repos
├── adc-cms-admin/ # Next.js 15 (src/app)
├── start-test.sh
└── HANDOFF.md / README*.md / .cursorrules

text

## PHẦN 3: TECH STACK
- DB: SQL Server 2022 (27 bảng).
- Backend: .NET 10 Minimal API, Dapper, Mapster. Port **5088**.
- Frontend: Next.js 15 App Router, React 19, Ant Design v6, Tailwind, Zustand, RJSF, liquidjs. Port **3000**.

## PHẦN 4: TRẠNG THÁI HIỆN TẠI (VERIFIED 2025-11-21)

### 4.1. Backend — 90 endpoints / 60 paths / 13 endpoint files
- Build: PASS, 0 warning, 0 error.
- Endpoint files: `AiEndpoints, AuthEndpoints, ContentEndpoints, CustomerEndpoints, EcommerceEndpoints, FormEndpoints, MediaEndpoints, MenuEndpoints, RbacEndpoints, SeoEndpoints, SeoRedirectEndpoints, SiteEndpoints, ThemeEndpoints`.

### 4.2. Auth (JWT Bearer) — có thực, KHÔNG document trong README_API
- `POST /api/auth/login` (AllowAnonymous) — trả JWT.
- `POST /api/auth/register` (AllowAnonymous).
- `GET /api/auth/me` (yêu cầu token).
- Cấu hình JWT tại `Program.cs:46-47`.

### 4.3. AllowAnonymous — 12 endpoints
| Nhóm | Path |
|------|------|
| Auth | `/api/auth/login`, `/api/auth/register` |
| Debug | `/api/debug/mapster-check`, `/api/debug/parse-html`, `/api/debug/import-theme` |
| Content | `/api/entries/filter`, `/api/entries/{id}`, `/api/entries/{id}/blocks` |
| Menu | `/api/menus`, `/api/menus/list` |
| Theme | `/api/themes`, `/api/themes/{themeId}/templates` |

### 4.4. Site API — chỉ 1 endpoint
- `PUT /api/sites/{siteId:guid}/active-theme` (file `SiteEndpoints.cs`).
- **CHƯA CÓ**: GET/PUT site tổng, GET site list.

### 4.5. Block API — 4 endpoints (file `ContentEndpoints.cs`)
- `GET  /api/entries/{entryId}/blocks?locale=vi`
- `POST /api/entries/{entryId}/blocks`
- `PUT  /api/blocks/{blockId}`
- `DELETE /api/blocks/{blockId}`

### 4.6. Theme API — có nhiều hơn README_API ghi
- `GET /api/themes?siteId=` (AllowAnonymous)
- `GET /api/themes/{id}` (chưa rõ chi tiết)
- `PUT /api/themes/{id}/variables`
- `GET /api/themes/{themeId}/templates` (AllowAnonymous)

### 4.7. Frontend Admin — Routes thực tế
(auth)/login
dashboard/{content-types, customers, ecommerce, entries, help,
media, menus, page-builder, rbac, settings, themes, users}

text
- Mỗi module có `components/` riêng.
- Không có route `/dashboard/seo` riêng → SEO redirects nằm trong `settings/`.
- AI Settings trong `settings/components/`.

### 4.8. Frontend Public Site
- Route duy nhất: `app/(public)/[[...slug]]/page.tsx`.
- `export const dynamic = 'force-dynamic'` tại dòng 36.
- `transformHtml(html, assetsBaseUrl, routePrefix='')` tại `lib/transformHtml.ts:77` (3 tham số, không phải 2 như tài liệu cũ).
- `lib/liquid.ts` import từ `liquidjs`.
- **[✅ VERIFIED] Chống cache:** Public Site KHÔNG dùng `fetch()` — toàn bộ data qua **axios** (`lib/publicApi.ts`). Cơ chế chống cache thực tế = `force-dynamic` + `NO_CACHE_HEADERS` (`publicData.ts:70`: `Cache-Control: no-cache`, `Pragma: no-cache`) gắn cho mọi request. `cache:'no-store'` là option của `fetch()` nên KHÔNG áp dụng — không phải gap.

### 4.9. Database
- 27 bảng — khớp schema.
- **[✅ VERIFIED] Trigger redirect 301 ĐÃ TỒN TẠI** tại `data/Trigger_SEO_Redirect.sql:7` — `trg_cms_entry_locales_auto_redirect ON cms_entry_locales AFTER UPDATE`. Logic: `UPDATE(slug)` + entry `published` + slug đổi → INSERT `cms_seo_redirects` (301, `old_path=/locale/old_slug`), có `NOT EXISTS` chống trùng. **Chỉ cần chạy file này khi setup DB** (không nằm trong `data_SmartCMS.sql`).
- **Chưa có seed data** (0 INSERT) — quyết định: KHÔNG seed, dùng dữ liệu thật nhập qua Admin.

### 4.10. Theme Parser — [✅ FIXED]
- Trước đây `ThemeImporter.cs` chỉ đọc `index.html` → chỉ tạo 1 template `layout_master`, bỏ sót `page-*`/`list-*`/`detail-*`.
- Đã sửa: `BuildTemplates()` duyệt MỌI file `.html`/`.htm` trong zip; `MapTemplate()` map tên file → `template_key`/`template_type`:
  - `index.html` → `layout_master` / `layout`
  - `page-{slug}.html` → `page_{slug}` / `page` (chuẩn hóa `-`→`_`)
  - `list-{slug}.html` → `list_{slug}` / `collection_list`
  - `detail-{slug}.html` → `detail_{slug}` / `collection_detail`
  - file `.html` khác → `{name}` / `page` (fallback, không bỏ sót)
- Giữ tương thích case cũ (`page_home` gạch dưới vẫn khớp). Chống trùng `template_key` (UQ_theme_template_key) bằng `HashSet`.

### 4.11. Route Mapping (Themes ↔ Menu ↔ Content Type ↔ Entries) — [✅ FIXED - Giải pháp B]
- **Vấn đề:** menu `/tin-tuc` nhưng route/template là `news` → lệch. Content type rác sinh từ template_key (`list_news`, `detail_news`...).
- **Giải pháp B (route_slug alias):** tách khóa kỹ thuật `api_id` khỏi nhãn SEO `route_slug`.
  - `cms_content_types.route_slug` (migration `data/Migration_RouteSlug.sql`): `news`→`tin-tuc`, `service`→`dich-vu`, `product`→`san-pham`.
  - `AutoSchemaGenerator.ResolveGroup`: KHÔNG dùng template_key làm api_id → fallback `page` (single). Hết sinh rác.
  - `ThemeMenuSeeder.MapLink`: `list-<slug>` → `link_type=custom` (dùng custom_url).
  - `themeMenu.ts:resolveHref`: ưu tiên `customUrl` trước mọi linkType.
  - `themeRouting.ts:resolveTemplateKey`: nhận `routeSlugMap` (route_slug→api_id), resolve alias trước khi dò template.
  - `publicData.ts:loadRouteSlugMap`: map route_slug→api_id từ `/api/content-types`.
  - `page.tsx`: resolve `contentTypeApiId` qua alias cho list/detail + metadata.
- **Kết quả:** `/tin-tuc`→`list_news`, `/tin-tuc/{slug}`→`detail_news`, `/dich-vu`→`list_service`, `/gioi-thieu`→`page_gioi_thieu`. Content type sạch: `news`, `service`, `product`.

### 4.12. Auto-Extract Schema (Parser → Content Type → Page/Block) — [✅ DONE]
- **Parser propagate ancestor collection/block** (`HtmlThemeParser.cs`): field trong `<div data-cms-collection>`/`data-cms-block` được gắn attr từ ancestor gần nhất → `ResolveGroup` map đúng `news`/`service`/component.
- **Heuristic field_type** (`HtmlThemeParser.InferFieldType`): thiếu `data-cms-type` → suy từ tag/class/key: `<img>`→`media`, prose/content→`rich_text`, `_at`/date→`datetime`, list/items/rows/tags→`json`, còn lại `string`.
- **Generator auto-create content type** (`AutoSchemaGenerator`): tạo content type theo `(site_id, api_id)`; luôn tạo `page` (single) khi có template `page_*`; UPDATE `field_type` khi field đã tồn tại nhưng type khác (heuristic mới).
- **No silent fail** (`AutoSchemaGenerator.PersistAsync`): mỗi INSERT field bọc try/catch con → 1 field lỗi không rollback cả transaction; warnings trả trong `AutoSchemaPersistResult.Warnings`.
- **PageBlockSeeder** (`IPageBlockSeeder`): mỗi template `page_*` → 1 entry `page` (slug `gioi-thieu`/`lien-he`) + gắn block (`data-cms-block`) vào `cms_entry_blocks` (idempotent).
- **Migration 001** (`data/migrations/001_add_raw_html.sql`): thêm cột `raw_html` = source of truth (HTML gốc, không convert Liquid); `compiled_html` = bản convert.
- **Endpoint mới:** `POST /api/debug/reparse-schema/{themeId}` — re-parse `extracted_schema` từ `raw_html` bằng Parser mới (không cần re-import zip).
- **Kết quả T1:** 12 content types (news/service/product + 9 component + page), news=7 field, service=11 field, page entries: gioi-thieu (3 block), lien-he (3 block), 3 menus + 13 items.

## PHẦN 5: QUYẾT ĐỊNH KIẾN TRÚC ĐÃ CHỐT

1. Public Site: `dynamic = 'force-dynamic'` + axios với `NO_CACHE_HEADERS` (đã verify, không dùng `fetch`/`cache:'no-store'`).
2. Static Assets Theme: `wwwroot/themes/{theme_code}` BE, FE rewrite URL về 5088.
3. Dapper: cấm `DbString`/`DynamicParameters` nullable → Anonymous Object + `(object)DBNull.Value`.
4. SP Filter: `usp_cms_dynamic_filter_entries` dùng `OUTER APPLY TOP 1`.

## PHẦN 6: SOURCE OF TRUTH
- `README.md` — Nghiệp vụ.
- `README_API.md` — Endpoints (đang SAI: 88 vs 90, thiếu Auth/Site/Block GET-POST/Theme GET).
- `data/data_SmartCMS.sql` — Schema (27 bảng). Trigger redirect ở file riêng `data/Trigger_SEO_Redirect.sql`.
- `.cursorrules` — Rules AI.

## PHẦN 7: NHIỆM VỤ TIẾP THEO

### Priority 0 — Verify nốt (BẮT BUỘC trước khi làm task lớn)
| # | Task | Cách làm |
|---|------|----------|
| P0.1 | Verify DB runtime | Cài `sqlcmd` HOẶC query qua API (`/api/content-types`, `/api/themes/{id}/templates`) khi backend chạy |
| P0.2 | ~~Verify `cache: 'no-store'`~~ | ✅ DONE — dùng axios + `NO_CACHE_HEADERS` + `force-dynamic` |
| P0.3 | ~~Verify templates theme active~~ | ✅ DONE — Parser đã fix (mục 4.10); cần re-import theme để DB có `page_*` |

### Priority 1 — Sửa GAP
| # | Task | Giá trị |
|---|------|---------|
| G1 | ~~Viết trigger `trg_cms_entry_locales_auto_redirect`~~ | ✅ ĐÃ CÓ tại `data/Trigger_SEO_Redirect.sql` — chỉ cần chạy khi setup DB |
| G2 | Cập nhật README_API.md (90 endpoint, Auth, Site, Block, Theme) | Doc chính xác |
| G3 | ~~Seed data demo~~ | ❌ KHÔNG làm — dùng dữ liệu thật nhập qua Admin |

### Priority 2 — High Customization (đã bàn)
| # | Task | Phụ thuộc |
|---|------|-----------|
| A | Liquid Template Editor + Preview | P0.3 |
| B | Theme Customizer Pro | Không |
| C1 | Component Builder (kind=component) | Không |
| C2 | Dynamic Zone Builder Pro | A + C1 |
| D | Custom Code Injection + Site Settings | Không |

## PHẦN 8: KNOWN GAPS (Verified)
1. [✅ RESOLVED] Trigger redirect 301 — có tại `data/Trigger_SEO_Redirect.sql:7` (chạy khi setup DB).
2. [⚠️] README_API lệch 90 vs 88 endpoint, thiếu 12 endpoint thực tế (Auth 3, Site 1, Block 2 GET/POST, Theme 2 GET).
3. [✅ BY DESIGN] Không seed data — dùng dữ liệu thật nhập qua Admin.
4. [✅ RESOLVED] `cache:'no-store'` — không áp dụng (dùng axios + `NO_CACHE_HEADERS` + `force-dynamic`).
5. [✅ FIXED] Parser `page_*` — `ThemeImporter.cs` đã đọc mọi `.html` (mục 4.10). Cần re-import theme để DB cập nhật.
6. [✅ DONE] Auto-Extract schema: Parser propagate collection + heuristic type + page/block seeding (mục 4.12).
