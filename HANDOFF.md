# DỰ ÁN: ADC SMART & COMPOSABLE CMS - HANDOFF V6.2

## PHẦN 1: QUY TẮC GIAO TIẾP TỐI ƯU TOKEN (RULES V2.0 - BẮT BUỘC TUÂN THỦ)
1. **KHÔNG IN CODE DÀI TRONG CHAT:** Tự động dùng tool hoặc lệnh `bash` để tạo/sửa file. Chỉ in đoạn thay đổi (tối đa 10 dòng).
2. **ĐỊNH DẠNG BÁO CÁO CỰC NGẮN:** Phản hồi theo cấu trúc:
   - `[TRẠNG THÁI]`: PASS / FAIL / CHỜ TEST.
   - `[ĐÃ LÀM]`: 1 câu ngắn gọn.
   - `[LỆNH CẦN CHẠY]`: 1 block code bash ngắn gọn (không giải thích).
3. **QUY TẮC TERMINAL:** KHÔNG TỰ CHẠY LỆNH TERMINAL. Lệnh build Backend dùng `dotnet build -v q --nologo`.
4. **QUY TẮC AI IDE (DEEPSEEK/ANTIGRAVITY):** Luôn nhắc AI tuân thủ file `.cursorrules` (tuyệt đối không dùng `any`, dùng `MenuProps`).

## PHẦN 2: TỔNG QUAN DỰ ÁN
- **Mục tiêu:** Hệ thống CMS tự động hóa từ HTML/CSS tĩnh, hỗ trợ Multi-site, Dynamic Content, Faceted Filter, RBAC 4 cấp, SEO, E-commerce, AI.
- **Kiến trúc:** Headless / Composable CMS.

## PHẦN 3: TECH STACK CỐ ĐỊNH
- **Database:** SQL Server 2022.
- **Backend:** .NET 10 (Minimal API), Dapper (`MatchNamesWithUnderscores = true`), Mapster.
- **Frontend:** Next.js 15.5.28 (App Router), React 19, Ant Design v6, Tailwind CSS, Zustand, RJSF (Dynamic Form).
- **Editor:** Tiptap (MIT License), tích hợp custom widget cho RJSF.
- **Drag & Drop:** @dnd-kit.
- **Môi trường:** Backend `5088`, Frontend `3000`.

## PHẦN 4: TRẠNG THÁI DỰ ÁN HIỆN TẠI
### 1. Backend (100% COMPLETED & TESTED)
- Full ~69 Endpoints PASS (58 gốc + Auth Users ×3 + Themes ×2 + Blocks ×2 chưa doc) (Auth, Content Types, Entries, Menus, E-commerce, SEO, Forms, RBAC).
- Đã fix các lỗi Dapper `DBNull` (dùng Anonymous Object thay vì `DbString`).
- Đã fix lỗi Circular Reference trong Menu.

### 2. Frontend (9 module DONE, 1 stub)
- **UI/UX:** Enterprise SaaS, Primary `#2563eb`, Inter/Roboto. AntD v6, Zustand, RJSF.
- **Core:** Auth ✓, Content Types ✓, Entries ✓ (Tiptap/RJSF), Menus ✓, Media ✓.
- **Themes** ✓: Import ZIP, Linter, Sinh Schema, Customizer (biến CSS), và **Xem/Copy mã Liquid Templates** (Modal AntD v6).
- **E-commerce** ✓: Orders (948L), Variants (859L), Promotions (619L) — full API.
- **RBAC** ✓: Roles (259L), Users (371L). **Settings** ✓: SEO Redirects (323L), AI Mock (320L).
- **Page Builder** ✓ (908L): Dynamic Zone (GET/POST/PUT/DELETE `/api/blocks`). 
- **Users** ✓ (430L): CRUD `/api/users`.
- **STUB:** `customers/page.tsx` (18L Placeholder) - chưa có API Backend.

## PHẦN 5: CÁC QUYẾT ĐỊNH KIẾN TRÚC ĐÃ CHỐT
1. Media: File lưu ở thư mục `wwwroot/uploads` của Backend, DB lưu URL tương đối. Frontend nối với `NEXT_PUBLIC_API_URL` để hiển thị.
2. Editor: Dùng Tiptap (MIT License) để tránh rủi ro bản quyền như TinyMCE/CKEditor.
3. Lỗi Dapper: Tuyệt đối không dùng `DynamicParameters` cho các trường có thể null. Dùng Anonymous Object (`new { Field = value }`).
4. Next.js: Tắt rule `@typescript-eslint/no-explicit-any` nhưng code phải sạch (dùng `unknown` + type guard).
## PHẦN 6: CÁC FILE SOURCE OF TRUTH
- `readme.md`: Yêu cầu nghiệp vụ.
- `README_API.md`: 58 endpoints — **CHƯA ĐỒNG BỘ**: thiếu Auth register, Users ×3, Themes ×2, Blocks ×2.
- `src/AdcSmartCms.Api/Endpoints/AuthEndpoints.cs`: `/api/users` CRUD (chưa doc).
- `src/AdcSmartCms.Api/Endpoints/ThemeEndpoints.cs`: `/api/themes`, `/api/themes/{id}/templates` (chưa doc).
- `data_SmartCMS.sql`: Schema Database (27 bảng).
- `adc-cms-admin/.cursorrules`: Quy tắc code Frontend.

## PHẦN 7: NHIỆM VỤ TIẾP THEO (V6.2)
1. **Customers CRM (High Priority):** Thay thế stub 18L bằng UI thật. Cần viết thêm BE: `GET /api/customers`, `GET /api/customers/{id}` (JOIN `cms_ecommerce_orders` + `cms_users`).
2. **AI Settings CRUD:** Bảng `cms_ai_settings` có trong SQL nhưng BE chưa có API CRUD. FE đang dùng mock localStorage. Cần bổ sung BE (`GET/PUT /api/ai/settings/{siteId}`) và wire lại UI.
3. **Sync & Polish:** Rà soát lại các form RJSF (xử lý edge cases), thêm loading state, responsive bảng trên mobile. Cập nhật `README_API.md` nếu có endpoint mới.

