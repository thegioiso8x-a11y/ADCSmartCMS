# ADC SMART CMS - DANH SÁCH API (README_API.md)

Base URL mặc định: `http://localhost:5088`
Tất cả body/response dùng `application/json` (trừ sitemap trả `application/xml` và import-theme dùng `multipart/form-data`).
`siteId` là GUID của site (ví dụ `tech_store`: `2FD0078F-0043-4083-B34F-4BDF7BF6A604`).

---

## 1. Debug (kiểm thử nội bộ, không lưu DB)

| Method | Route | Mô tả | Params chính |
|---|---|---|---|
| GET | `/api/debug/mapster-check` | Kiểm tra cấu hình Mapster với dữ liệu site giả lập | Không |
| POST | `/api/debug/parse-html` | Bóc tách HTML, trả kết quả parser (chưa lưu DB) | Body: `{ "html": "<string>" }` |
| POST | `/api/debug/lint-theme` | Upload gói theme `.zip`, trả báo cáo linter | Form-data: `file` (bắt buộc) |
| POST | `/api/debug/import-theme` | Import theme: lint → lưu `cms_themes` + `cms_theme_templates` | Form-data: `file` (bắt buộc), `assetsBaseUrl` (bắt buộc), `themeCode`, `themeName`, `version` |
| POST | `/api/debug/generate-schema/{themeId}` | Đọc `extracted_schema` của theme, sinh `cms_content_types` + `cms_field_definitions` (idempotent) | Route: `themeId` (GUID) |

---


## 1.5. Auth & Users (Quản trị viên)
| Method | Route | Mô tả | Params chính |
|---|---|---|---|
| GET | `/api/users` | Danh sách user (không chứa password), mới nhất trước | Không |
| POST | `/api/users` | Tạo user mới | Body: `email` (bắt buộc), `password` (>=6 ký tự), `fullName` (bắt buộc). Trùng email → `409` |
| PUT | `/api/users/{id}` | Cập nhật user (null = giữ nguyên) | Route: `id`; Body: `password` (nếu có phải >=6 ký tự), `fullName`, `avatarUrl`, `isSuperAdmin`, `isActive` |
| DELETE | `/api/users/{id}` | Xóa user (cascade xóa user_roles) | Route: `id` |

---
## 2. Theme

| Method | Route | Mô tả | Params chính |
|---|---|---|---|
| POST | `/api/debug/import-theme` | (Xem nhóm Debug) Import gói theme ZIP vào DB | Form-data: `file`, `assetsBaseUrl`, `themeCode`, `themeName`, `version` |
| POST | `/api/debug/generate-schema/{themeId}` | (Xem nhóm Debug) Sinh schema động từ theme | Route: `themeId` |

| PUT | `/api/themes/{id}/variables` | Cập nhật CSS variables (`theme_variables` JSON object) | Route: `id`; Body: `themeVariables` (bắt buộc, phải là JSON object) |
| GET | `/api/themes/{themeId}/templates` | Danh sách template của theme (Liquid HTML + schema) | Route: `themeId` |

> Ghi chú: hiện theme được phục vụ qua các endpoint trên (`ThemeEndpoints.cs`).

---

## 3. Content (Content Types & Entries)

| Method | Route | Mô tả | Params chính |
|---|---|---|---|
| GET | `/api/content-types` | Danh sách content type (dùng chung + riêng của site) | Query: `siteId` (tùy chọn) |
| POST | `/api/content-types` | Tạo content type mới | Body: `siteId` (null = dùng chung), `apiId` (bắt buộc), `displayName` (bắt buộc), `kind` (mặc định `collection`), `description`, `isLocalized`, `enableVersioning`, `enableWorkflow` |
| PUT | `/api/content-types/{id}` | Cập nhật content type (null = giữ nguyên) | Route: `id`; Body: `displayName`, `kind`, `description`, `isLocalized`, `enableVersioning`, `enableWorkflow` |
| DELETE | `/api/content-types/{id}` | Xóa content type (cascade xóa fields) | Route: `id` |
| GET | `/api/content-types/{apiId}/fields` | Danh sách trường động của 1 content type | Route: `apiId`; Query: `siteId` (tùy chọn) |
| POST | `/api/content-types/{contentTypeId}/fields` | Tạo field mới | Route: `contentTypeId`; Body: `fieldKey` (bắt buộc), `displayLabel` (bắt buộc), `fieldType` (bắt buộc), `isRequired`, `isUnique`, `isLocalized`, `isSearchable`, `isIndexed`, `isFilterable`, `filterType`, `sortOrder` |
| PUT | `/api/content-types/fields/{fieldId}` | Cập nhật field (null = giữ nguyên) | Route: `fieldId`; Body: `displayLabel`, `fieldType`, `isRequired`, `isUnique`, `isLocalized`, `isSearchable`, `isIndexed`, `isFilterable`, `filterType`, `sortOrder` |
| DELETE | `/api/content-types/fields/{fieldId}` | Xóa field | Route: `fieldId` |
| POST | `/api/entries` | Tạo entry (`base_data` + `localized_data` JSON) rồi đồng bộ index qua SP | Body: `siteId` (bắt buộc), `contentTypeApiId` (bắt buộc), `title`, `slug`, `baseData` (JSON object), `localizedData` (JSON object), `locale` (mặc định `vi`) |
| GET | `/api/entries/{entryId}` | Chi tiết 1 entry theo locale | Route: `entryId`; Query: `locale` (mặc định `vi`) |
| PUT | `/api/entries/{entryId}` | Cập nhật entry (`base_data` + locale `title`/`slug`/`localized_data`) rồi đồng bộ index | Route: `entryId`; Body: `title`, `slug`, `baseData` (JSON object), `localizedData` (JSON object), `locale` (mặc định `vi`) |
| DELETE | `/api/entries/{entryId}` | Xóa entry (bảng con xóa theo CASCADE) | Route: `entryId` |

| PUT | `/api/blocks/{blockId}` | Cập nhật khối (null = giữ nguyên) | Route: `blockId`; Body: `blockData` (JSON object), `sortOrder`, `isVisible` |
| DELETE | `/api/blocks/{blockId}` | Xóa khối | Route: `blockId` |

---
## 4. Filter (Faceted Filter)

| Method | Route | Mô tả | Params chính |
|---|---|---|---|
| GET | `/api/entries/filter` | Gọi SP `usp_cms_dynamic_filter_entries`: danh sách phân trang + facet counts | Query: `siteId` (bắt buộc), `contentTypeApiId` (bắt buộc), `locale` (mặc định `vi`), `keyword`, `filtersJson` (JSON array), `sortField` (mặc định `published_at`), `sortDir` (`ASC`/`DESC`, mặc định `DESC`), `pageIndex` (mặc định 1), `pageSize` (mặc định 10) |

`filtersJson` ví dụ: `[{"field":"brand","op":"in","values":["apple"]},{"field":"price","op":"range","min":100,"max":500}]`

---

## 5. Workflow & Versioning

| Method | Route | Mô tả | Params chính |
|---|---|---|---|
| PUT | `/api/entries/{entryId}/status` | Đổi trạng thái workflow; `published` → set `published_at` | Route: `entryId`; Body: `{ "status": "draft\|in_review\|approved\|scheduled\|published\|archived" }` |
| GET | `/api/entries/{entryId}/versions` | Lịch sử phiên bản (`version_number` DESC) | Route: `entryId` |

---

## 6. SEO

| Method | Route | Mô tả | Params chính |
|---|---|---|---|
| GET | `/api/seo/sitemap` | Xuất `sitemap.xml` (entry `published` + `is_indexable = 1`) | Query: `siteId` (bắt buộc) |
| GET | `/api/seo/redirects` | Danh sách redirect của site (mới nhất trước) | Query: `siteId` (bắt buộc) |
| GET | `/api/seo/redirects/{id}` | Chi tiết 1 redirect | Route: `id` |
| POST | `/api/seo/redirects` | Tạo redirect 301/302/307/308 | Body: `siteId` (bắt buộc), `oldPath` (bắt buộc), `newPath` (bắt buộc), `statusCode` (mặc định `301`), `isRegex` (mặc định `false`), `note` |
| PUT | `/api/seo/redirects/{id}` | Cập nhật redirect (null = giữ nguyên) | Route: `id`; Body: `oldPath`, `newPath`, `statusCode`, `isRegex`, `note` |
| DELETE | `/api/seo/redirects/{id}` | Xóa redirect | Route: `id` |

> `statusCode` hợp lệ: `301`, `302`, `307`, `308`. Trùng `(site_id, old_path)` → `409`.

---

## 7. Menu (đa cấp, đa ngôn ngữ)

| Method | Route | Mô tả | Params chính |
|---|---|---|---|
| GET | `/api/menus` | Trả cây menu đa cấp (sắp theo `hierarchy_path`) | Query: `siteId` (bắt buộc), `menuCode` (bắt buộc) |
| GET | `/api/menus/list` | Danh sách tất cả menu của site (mới nhất trước) | Query: `siteId` (bắt buộc) |
| POST | `/api/menus` | Tạo menu mới | Body: `siteId` (bắt buộc), `menuCode` (bắt buộc), `menuName` (bắt buộc), `isActive` (mặc định `true`) |
| PUT | `/api/menus/{menuId}` | Cập nhật menu gốc (null = giữ nguyên) | Route: `menuId`; Body: `menuName`, `isActive` |
| POST | `/api/menus/{menuId}/items` | Tạo menu item (tự sinh `hierarchy_path`) | Route: `menuId`; Body: `parentId`, `titleLocales` (JSON object đa ngôn ngữ), `linkType` (`entry`\|`collection`\|`custom`), `targetEntryId`, `customUrl`, `targetBlank`, `iconClass`, `sortOrder`, `isVisible` |
| PUT | `/api/menus/{menuId}/items/{itemId}` | Cập nhật menu item (null = giữ nguyên). `parentId`: null = giữ nguyên, `00000000-0000-0000-0000-000000000000` = chuyển thành mục gốc, GUID khác = chuyển làm con (tự rebuild `hierarchy_path` cả cây con) | Route: `menuId`, `itemId`; Body: `titleLocales`, `customUrl`, `sortOrder`, `targetBlank`, `parentId` |
| DELETE | `/api/menus/items/{itemId}` | Xóa 1 menu item (chặn nếu còn mục con → `409`) | Route: `itemId`; Query: `menuId` (bắt buộc) |
| DELETE | `/api/menus/{menuId}` | Xóa menu (cascade xóa items) | Route: `menuId` |

`titleLocales` ví dụ: `{ "vi": "Sản phẩm", "en": "Products" }`

---

## 8. Form (Dynamic Forms / Leads)

| Method | Route | Mô tả | Params chính |
|---|---|---|---|
| POST | `/api/forms/{formCode}/submit` | Nhận mọi cặp key-value, lưu vào `cms_form_submissions` (`lead_status = 'new'`) | Route: `formCode`; Query: `siteId` (bắt buộc); Body: JSON object tùy ý, ví dụ `{ "full_name": "Nguyen Van A", "phone": "0901234567" }` |
| GET | `/api/forms` | Danh sách định nghĩa form của site (mới nhất trước) | Query: `siteId` (bắt buộc) |
| GET | `/api/forms/{formId}` | Chi tiết 1 định nghĩa form | Route: `formId` |
| POST | `/api/forms` | Tạo định nghĩa form mới | Body: `siteId` (bắt buộc), `formCode` (bắt buộc), `formName` (bắt buộc), `fieldsSchema` (JSON array), `notificationConfig` (JSON object), `successMessageLocales` (JSON object), `isActive` (mặc định `true`) |
| PUT | `/api/forms/{formId}` | Cập nhật định nghĩa form (null = giữ nguyên) | Route: `formId`; Body: `formName`, `fieldsSchema`, `notificationConfig`, `successMessageLocales`, `isActive` |
| DELETE | `/api/forms/{formId}` | Xóa form (cascade xóa submissions) | Route: `formId` |

> `fieldsSchema` phải là JSON array; `notificationConfig`/`successMessageLocales` phải là JSON object. Trùng `(site_id, form_code)` → `409`.

---

## 9. RBAC (Dynamic Permissions 4 cấp)

| Method | Route | Mô tả | Params chính |
|---|---|---|---|
| POST | `/api/rbac/check` | Kiểm tra quyền (Site → Entity → Row → Field) | Body: `userId` (bắt buộc), `siteId` (bắt buộc), `contentTypeApiId` (bắt buộc), `action` (bắt buộc), `ownerId` (tùy chọn, dùng cho `scope = 'own'`) |
| GET | `/api/rbac/users/{userId}/roles` | Danh sách `role_code` của user trong site | Route: `userId`; Query: `siteId` (bắt buộc) |
| GET | `/api/rbac/users/{userId}/permissions` | Danh sách permission chi tiết của user | Route: `userId`; Query: `siteId` (bắt buộc) |
| GET | `/api/rbac/roles` | Danh sách role (toàn hệ thống + của site) | Query: `siteId` (tùy chọn) |
| POST | `/api/rbac/roles` | Tạo role mới | Body: `siteId` (null = toàn hệ thống), `roleCode` (bắt buộc), `roleName` (bắt buộc), `description` |
| DELETE | `/api/rbac/roles/{roleId}` | Xóa role (cascade user_roles + permissions) | Route: `roleId` |
| POST | `/api/rbac/users/{userId}/roles` | Gán role cho user (idempotent) | Route: `userId`; Body: `{ "roleId": "..." }` |
| DELETE | `/api/rbac/users/{userId}/roles/{roleId}` | Thu hồi role khỏi user | Route: `userId`, `roleId` |

Response `/api/rbac/check`:
```json
{ "hasAccess": true, "isSuperAdmin": false, "matchedRoleCode": "editor", "matchedScope": "own", "allowedFields": ["title","price"], "reason": "..." }
```

---

## 10. E-Commerce (Variants, Promotions, Orders)

| Method | Route | Mô tả | Params chính |
|---|---|---|---|
| POST | `/api/ecommerce/variants` | Tạo biến thể cho 1 entry | Body: `siteId`, `entryId`, `skuCode` (bắt buộc), `price`, `salePrice`, `costPrice`, `stockQuantity`, `trackInventory`, `variantOptions` (JSON object), `barcode`, `imageUrl`, `weightGram`, `isDefault`, `isActive` |
| GET | `/api/ecommerce/variants` | Danh sách biến thể của 1 sản phẩm | Query: `entryId` (bắt buộc) |
| PUT | `/api/ecommerce/variants/{variantId}` | Cập nhật variant (null = giữ nguyên) | Route: `variantId`; Body: `price`, `salePrice`, `stockQuantity`, `variantOptions` |
| DELETE | `/api/ecommerce/variants/{variantId}` | Xóa variant | Route: `variantId` |
| POST | `/api/ecommerce/promotions` | Tạo mã giảm giá | Body: `siteId`, `couponCode`, `title`, `discountType` (`percentage`\|`fixed_amount`\|`free_shipping`), `discountValue`, `startAt`, `endAt`, `maxDiscountAmount`, `minOrderAmount`, `usageLimit`, `isActive` |
| POST | `/api/ecommerce/promotions/validate` | Kiểm tra mã + tính số tiền giảm | Body: `siteId`, `couponCode`, `orderAmount` |
| PUT | `/api/ecommerce/promotions/{promoId}` | Cập nhật mã giảm giá (null = giữ nguyên) | Route: `promoId`; Body: `title`, `discountValue`, `isActive` |
| DELETE | `/api/ecommerce/promotions/{promoId}` | Xóa mã giảm giá | Route: `promoId` |
| POST | `/api/ecommerce/orders` | Tạo đơn hàng (transaction ACID: tính tiền → áp mã → trừ tồn kho → insert order/items) | Body: `siteId`, `customerId`, `shippingInfo` (JSON object), `items` `[{ "variantId", "quantity" }]`, `couponCode`, `paymentMethod`, `shippingFee`, `taxAmount`, `customerNote` |
| PUT | `/api/ecommerce/orders/{orderId}/status` | Cập nhật `order_status` / `payment_status` (null = giữ nguyên) | Route: `orderId`; Body: `orderStatus`, `paymentStatus` |
| DELETE | `/api/ecommerce/orders/{orderId}` | Xóa đơn hàng (cascade xóa order_items) | Route: `orderId` |

Lỗi nghiệp vụ đơn hàng: `409` khi không đủ tồn kho, `404` khi variant không tồn tại, `400` khi mã giảm giá không hợp lệ.

---

## 11. AI (Mock + Settings CRUD)

| Method | Route | Mô tả | Params chính |
|---|---|---|---|
| POST | `/api/ai/generate-seo` | Sinh SEO metadata (MetaTitle, MetaDescription, Tags, SuggestedSlug) | Body: `title`, `content` (ít nhất 1 trong 2) |
| POST | `/api/ai/translate` | Dịch văn bản (Mock, bọc nhãn `[Translated to XX]`) | Body: `text` (bắt buộc), `sourceLang` (mặc định `vi`), `targetLang` (bắt buộc) |

> `MockAiService` trả `provider = "mock"`, `isMock = true`. Thay bằng implementation thật (đọc `cms_ai_settings`) khi cần.

### AI Settings CRUD (chỉ Super Admin — `is_super_admin = true`, ngược lại `403`)

| Method | Route | Mô tả | Params chính |
|---|---|---|---|
| GET | `/api/ai/settings/{siteId}` | Lấy cấu hình AI của site (key đã mask `sk-...abcd`). Lazy reset `tokens_used_this_month = 0` nếu `updated_at` thuộc tháng/năm trước | Route: `siteId` (GUID) |
| PUT | `/api/ai/settings/{siteId}` | Upsert cấu hình AI. `apiKey` chứa `...` (masked) → giữ nguyên key cũ; key mới → mã hóa AES-256 (master key từ ENV `ADC_AI_MASTER_KEY`) | Route: `siteId`; Body: `provider`, `apiKey`, `defaultTextModel`, `defaultVisionModel`, `promptConfigs` (JSON object), `monthlyTokenLimit`, `isEnabled` |

> Response không bao giờ trả key thật. Thiếu ENV `ADC_AI_MASTER_KEY` khi lưu key mới → `500` với thông báo rõ.

---

## 12. Media (Smart DAM - Folders & Assets)

| Method | Route | Mô tả | Params chính |
|---|---|---|---|
| GET | `/api/media/folders` | Danh sách thư mục media của site (sắp theo `folder_path`) | Query: `siteId` (bắt buộc) |
| POST | `/api/media/folders` | Tạo thư mục media (tự tính `folder_path` từ parent) | Body: `siteId` (bắt buộc), `folderName` (bắt buộc), `parentId` (tùy chọn) |
| GET | `/api/media/assets` | Danh sách file theo site + folder (`folderId` null = tất cả) | Query: `siteId` (bắt buộc), `folderId` (tùy chọn) |
| POST | `/api/media/upload` | Upload file: lưu vào `/uploads/`, insert `cms_media_assets` | Form-data: `file` (bắt buộc), `siteId` (bắt buộc), `folderId` (tùy chọn) |
| PUT | `/api/media/assets/{id}` | Cập nhật thông tin file (null = giữ nguyên) | Route: `id`; Body: `fileName`, `altTextLocales` (JSON object string), `folderId` |
| DELETE | `/api/media/assets/{id}` | Xóa asset (DB + file vật lý) | Route: `id` |

> File upload được phục vụ tĩnh qua URL `http://localhost:5088/uploads/{fileName}` (đã bật `UseStaticFiles`). Chưa xử lý nén WebP/AVIF (sẽ bổ sung sau).

---

## 13. Customers CRM (tổng hợp từ đơn hàng)

Khách hàng được tổng hợp từ bảng `cms_ecommerce_orders`:
- `customer_id != NULL` → khách có tài khoản (JOIN `cms_users`).
- `customer_id IS NULL` → khách vãng lai, thông tin lấy từ JSON `shipping_info` (`fullName`/`full_name`/`name`, `phone`, `email`, `address`).

Mỗi khách có `customerKey`: `user:{userId}` hoặc `guest:{phone|email|name}` (dùng làm `{id}` cho endpoint chi tiết).

| Method | Route | Mô tả | Params chính |
|---|---|---|---|
| GET | `/api/customers` | Danh sách khách hàng của site (sắp theo lần mua gần nhất giảm dần) | Query: `siteId` (bắt buộc), `keyword` (tùy chọn — lọc theo tên/SĐT/email) |
| GET | `/api/customers/{id}` | Chi tiết khách + lịch sử đơn hàng | Route: `id` (CustomerKey); Query: `siteId` (bắt buộc) |

Response `/api/customers` (mỗi phần tử):
```json
{ "customerKey": "guest:0901234567", "isRegistered": false, "userId": null,
  "fullName": "Nguyen Van A", "phone": "0901234567", "email": null, "address": "...",
  "orderCount": 3, "totalSpent": 1500000, "lastOrderAt": "...", "firstOrderAt": "..." }
```

Response `/api/customers/{id}`: `{ "customer": { ...CustomerListItemDto }, "orders": [ { "id", "orderCode", "orderStatus", "paymentStatus", "paymentMethod", "totalAmount", "couponCode", "createdAt" } ] }`

> `404` khi không tìm thấy khách theo `customerKey`.

---

## Quy ước lỗi chung

- `400 Bad Request`: thiếu/sai tham số (`{ "error": "..." }`).
- `404 Not Found`: không tìm thấy menu / content type / entry / form / user / variant / role / redirect / order.
- `409 Conflict`: trùng `menuCode` / `skuCode` / `couponCode` / `formCode` / `roleCode` / `old_path` trong cùng site; không đủ tồn kho; xóa menu item còn mục con.
- `201 Created`: tạo mới thành công (entry, menu, menu item, form, form submission, variant, promotion, order, role, redirect).

---


## Tổng hợp nhanh (14 nhóm, 88 endpoint)

| Nhóm | Số endpoint | File nguồn |
|---|---|---|
| Auth & Users | 7 | `AuthEndpoints.cs` |
| Debug | 3 | `Program.cs` |
| Theme | 5 | `ThemeEndpoints.cs` |
| Content | 19 | `ContentEndpoints.cs` |
| Filter | 1 | `ContentEndpoints.cs` |
| Workflow & Versioning | 2 | `ContentEndpoints.cs` |
| SEO | 6 | `SeoEndpoints.cs`, `SeoRedirectEndpoints.cs` |
| Menu | 8 | `MenuEndpoints.cs` |
| Form | 6 | `FormEndpoints.cs` |
| RBAC | 8 | `RbacEndpoints.cs` |
| E-Commerce | 14 | `EcommerceEndpoints.cs` |
| AI (Mock + Settings) | 4 | `AiEndpoints.cs` |
| Media | 6 | `MediaEndpoints.cs` |
| Customers CRM | 2 | `CustomerEndpoints.cs` |

> Ghi chú: Content (19) đã bao gồm 1 endpoint Filter và 2 endpoint Workflow/Versioning (cùng file `ContentEndpoints.cs`); Debug (3) là các endpoint trong `Program.cs` (import-theme/generate-schema nằm ở `ThemeEndpoints.cs`).

**Trạng thái: Backend Core 100% Completed (Full CRUD).**
