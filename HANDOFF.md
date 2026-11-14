# DỰ ÁN: ADC SMART & COMPOSABLE CMS - HANDOFF V6.0

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
- Full 58 Endpoints PASS (Auth, Content Types, Entries, Menus, E-commerce, SEO, Forms, RBAC).
- Đã fix các lỗi Dapper `DBNull` (dùng Anonymous Object thay vì `DbString`).
- Đã fix lỗi Circular Reference trong Menu.

### 2. Frontend (Đã xong ~80% Giao diện cốt lõi)
- **UI/UX:** Đã áp dụng theme "Enterprise SaaS" (Sidebar trắng, Header trắng, màu Primary xanh dương `#2563eb`, font Inter/Roboto).
- **Auth:** Trang Login PASS.
- **Content Types:** CRUD đầy đủ (Types + Fields).
- **Entries:** CRUD đầy đủ, tích hợp RJSF.
- **Tiptap Editor:** Đã tích hợp thành công, có đủ 4 nhóm công cụ (Định dạng, Cấu trúc, Media, Hỗ trợ). Đã fix CSS cho Bảng (Table). Đã kết nối chèn Ảnh/Video với `MediaPickerModal`.
- **Menus:** CRUD đầy đủ + Kéo thả đa cấp (`@dnd-kit`).
- **Media:** CRUD đầy đủ (Cây thư mục, Upload file, Xem ảnh).
- **ĐANG DỞ:** Chưa làm giao diện E-commerce (Orders, Variants, Promotions), RBAC (Ma trận phân quyền), Settings (SEO Redirects, AI Settings).
## PHẦN 5: CÁC QUYẾT ĐỊNH KIẾN TRÚC ĐÃ CHỐT
1. Media: File lưu ở thư mục `wwwroot/uploads` của Backend, DB lưu URL tương đối. Frontend nối với `NEXT_PUBLIC_API_URL` để hiển thị.
2. Editor: Dùng Tiptap (MIT License) để tránh rủi ro bản quyền như TinyMCE/CKEditor.
3. Lỗi Dapper: Tuyệt đối không dùng `DynamicParameters` cho các trường có thể null. Dùng Anonymous Object (`new { Field = value }`).
4. Next.js: Tắt rule `@typescript-eslint/no-explicit-any` nhưng code phải sạch (dùng `unknown` + type guard).
## PHẦN 6: CÁC FILE SOURCE OF TRUTH
- `readme.md`: Yêu cầu nghiệp vụ.
- `README_API.md`: Danh sách API (58 endpoints).
- `data_SmartCMS.sql`: Schema Database (27 bảng).
- `adc-cms-admin/.cursorrules`: Quy tắc code Frontend.

## PHẦN 7: NHIỆM VỤ TIẾP THEO NGAY LẬP TỨC
1. **Frontend (E-commerce):** Tạo trang `/dashboard/ecommerce` với 3 tab: Orders, Variants, Promotions. Gọi các API tương ứng.
2. **Frontend (RBAC):** Tạo trang `/dashboard/rbac` hiển thị danh sách Roles và User, có nút gán quyền.
3. **Frontend (Settings):** Tạo trang `/dashboard/settings` cho SEO Redirects và cấu hình AI.

