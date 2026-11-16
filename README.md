#TỔNG HỢP ĐẦY ĐỦ CHỨC NĂNG SẢN PHẨM (PRODUCT SPECIFICATION)
Dựa trên toàn bộ kiến trúc đã phân tích, dưới đây là Bản Đặc tả Chức năng Tổng thể (Master Feature List) của sản phẩm ADC Smart CMS được chia thành 7 Phân hệ (Modules) rõ ràng để bạn lập kế hoạch phát triển và phân công cho đội ngũ lập trình viên.
##Phân hệ 1: Bộ máy Tự động Hóa Giao diện (Auto-Theme & HTML Importer Engine)
**Mục tiêu: Biến bản cắt HTML/CSS từ Figma thành website hoàn chỉnh trong 5 phút không cần viết code Backend.**
    1. Trình Kiểm tra Gói Giao diện (Theme Linter & Validator):
        ◦ Quét file .zip chứa các file .html, .css, .js, /images khi tải lên.
        ◦ Kiểm tra tính hợp lệ của các thuộc tính đánh dấu data-cms-*, cảnh báo các thẻ thiếu khai báo hoặc đường dẫn liên kết nội bộ bị gãy.
    2. Bộ Bóc tách Khung Giao diện Tự động (Master Layout Extractor):
        ◦ Tự động nhận diện data-cms-region="header" và footer từ file index.html để tạo layout_master.
        ◦ Tự động lược bỏ Header/Footer trùng lặp ở các file trang con (page-*.html, list-*.html, detail-*.html) và giữ lại phần ruột main.
    3. Bộ Tự động Sinh Cấu trúc Bảng & Nạp Dữ liệu Mẫu (Auto-Schema & Seeder):
        ◦ Đọc các thẻ data-cms-block, data-cms-collection và data-cms-field trong HTML để tự động INSERT vào bảng cms_content_types và cms_field_definitions.
        ◦ Hợp nhất (Merge) danh sách trường của file list-*.html và detail-*.html có cùng mã data-cms-collection.
        ◦ Trích xuất văn bản và hình ảnh mẫu có sẵn trong file HTML tĩnh để tạo bản ghi mẫu ban đầu vào bảng cms_entries và cms_entry_blocks.
    4. Trình Biên dịch Liquid & Quản lý Biến Giao diện (Theme Customizer):
        ◦ Tự động chuyển đổi các thẻ HTML có gắn data-cms-* sang mã khuôn mẫu Liquid Template và lưu vào cms_theme_templates. Hỗ trợ xem trước, kiểm tra và Copy mã Liquid Template trực tiếp trên giao diện Admin.
        ◦ Tự động đọc các biến màu sắc/font chữ trong :root của file CSS đưa vào bảng chọn màu (Color Picker) trên Admin.
##Phân hệ 2: Quản trị Cấu trúc Dữ liệu Động (Dynamic Content Modeling)
**Mục tiêu: Cho phép tạo thêm bất kỳ mô hình dữ liệu nào ngay trên giao diện Admin.**
    1. Quản lý Thực thể Động (Content Type Builder):
        ◦ Tạo/Sửa/Xóa 3 loại thực thể: Collection Types (Bài viết, Sản phẩm, Dự án, Khóa học), Single Types (Cấu hình Trang chủ, Giới thiệu), và Components/Blocks (Khối giao diện tái sử dụng).
    2. Thư viện 14 Kiểu Trường Dữ liệu (Custom Fields Library):
        ◦ Văn bản ngắn (string), Văn bản dài (text), Trình soạn thảo (rich_text), Số nguyên (integer), Số thực/Tiền tệ (decimal), Đúng/Sai (boolean), Ngày giờ (datetime), Danh sách chọn đơn (enumeration), Danh sách chọn nhiều (multi_select), Tập tin/Hình ảnh (media), Quan hệ (relation), Khối lặp (repeater), Khối giao diện động (dynamic_zone), Dữ liệu JSON tự do (json).
    3. Thiết lập Quy tắc Kiểm류 & Bộ lọc Động (Validation & Facet Configurator):
        ◦ Cấu hình bắt buộc nhập (is_required), duy nhất (is_unique), biểu thức chính quy (regex), giới hạn min/max.
        ◦ Bật/tắt cờ is_filterable và chọn kiểu hiển thị bộ lọc ngoài Frontend (Checkbox chọn nhiều, Thanh trượt khoảng giá, Chọn màu sắc, Cây phân cấp).
    4. Quản lý Quan hệ Vạn năng (Universal Relations):
        ◦ Kéo-thả thiết lập mối quan hệ 1-1, 1-N, N-N giữa bất kỳ 2 Content Types nào (VD: Bài viết – Chuyên mục, Khóa học – Giảng viên, Dự án – Tiện ích).
##Phân hệ 3: Trình Biên tập Nội dung, Đa Ngôn ngữ & Page Builder
**Mục tiêu: Mang lại trải nghiệm nhập liệu trực quan, linh hoạt và an toàn cho biên tập viên.**
    1. Giao diện Nhập liệu Tự động (Auto-Generated Admin Forms):
        ◦ Tự động kết xuất giao diện Form Thêm/Sửa/Danh sách dựa trên cấu hình trong bảng cms_field_definitions mà không cần lập trình viên viết trang Admin riêng.
    2. Trình Dựng Trang Kéo-Thả (Visual Block / Dynamic Zone Builder):
        ◦ Cho phép biên tập viên lắp ghép trang từ các khối <section> đã bóc tách từ file HTML, đổi thứ tự lên/xuống, ẩn/hiện khối hoặc nhân bản khối trên trang.
    3. Quản lý Đa Ngôn ngữ Thông minh (Multi-language / i18n):
        ◦ Tách biệt thông minh: các trường dùng chung (Giá, Mã SKU, Tồn kho) chỉ cần nhập 1 lần; các trường ngôn ngữ (Tiêu đề, Đường dẫn, Mô tả) chuyển đổi theo từng tab ngôn ngữ (VI, EN, JA, KO...).
    4. Lịch sử Phiên bản & Quy trình Duyệt bài (Versioning & Workflow):
        ◦ Quy trình chuyển trạng thái: Nháp (Draft) $\rightarrow$ Chờ duyệt (In Review) $\rightarrow$ Đã duyệt (Approved) $\rightarrow$ Hẹn giờ đăng (Scheduled) $\rightarrow$ Xuất bản (Published).
        ◦ Lưu Snapshot mỗi lần sửa vào cms_entry_versions, cho phép xem so sánh (Diff) và khôi phục (Rollback) về bất kỳ phiên bản cũ nào.
    5. Quản lý Menu Đa cấp & Form Thu thập Khách hàng (Dynamic Menus & Forms):
        ◦ Kéo-thả cây Menu đa cấp đồng bộ trực tiếp vào vùng data-cms-menu.
        ◦ Tự động thu thập dữ liệu khách hàng gửi từ các <form data-cms-form="...">, lưu vào DB và bắn thông báo qua Email/Telegram/Zalo.
##Phân hệ 4: Phân quyền Động Đa cấp & Quản trị Đa Website (Multi-Site & RBAC)
**Mục tiêu: Đảm bảo bảo mật cấp doanh nghiệp và khả năng nhân bản hàng loạt dự án.**
    1. Trung tâm Quản trị Đa Website (Multi-Site / Tenant Manager):
        ◦ Quản lý nhiều website/tên miền trên cùng 1 hệ thống hoặc xuất gói cài đặt độc lập (Clone Code + DB).
        ◦ Cấu hình riêng cho từng website: Tên miền chính/phụ, Giao diện đang kích hoạt, Ngôn ngữ mặc định, SMTP gửi mail, mã theo dõi Google Analytics / Facebook Pixel.
    2. Ma trận Phân quyền Động 4 Cấp độ (Dynamic RBAC Engine):
        ◦ Cấp 1 (Site-level): Phân quyền User được phép truy cập những Website nào.
        ◦ Cấp 2 (Entity & Action): Phân quyền Xem / Thêm / Sửa / Xóa / Duyệt đăng / Sửa cấu trúc bảng trên từng Content Type động.
        ◦ Cấp 3 (Row-level Scope): Chỉ được xem/sửa bài do chính mình tạo (own) hay toàn bộ bài của phòng ban (all).
        ◦ Cấp 4 (Field-level Security): Ẩn hoặc khóa quyền chỉnh sửa trên từng trường nhạy cảm (VD: chỉ Kế toán được sửa trường cost_price và sale_price).
##Phân hệ 5: Tối ưu SEO Kỹ thuật Tự động & Quản lý Media (Technical SEO & Smart DAM)
**Mục tiêu: Đạt tối đa điểm Google PageSpeed / Core Web Vitals và bảo vệ thứ hạng từ khóa.**
    1. Tự động hóa On-Page SEO & Schema JSON-LD:
        ◦ Tự động sinh đường dẫn slug chuẩn tiếng Việt không dấu, kiểm tra trùng lặp theo từng ngôn ngữ và từng website.
        ◦ Tự động sinh mã Schema Markup (JSON-LD) chuẩn Google (Article, Product, Course, RealEstateListing, FAQPage, BreadcrumbList).
    2. Bảo vệ Thứ hạng Kỹ thuật (Technical SEO Guard):
        ◦ Tự động ghi lệnh chuyển hướng 301 Redirect khi đổi slug của bài viết đã xuất bản (nhờ Trigger trg_cms_entry_locales_auto_redirect).
        ◦ Tự động xuất sitemap.xml phân trang và robots.txt riêng cho từng tên miền trong dưới 10ms.
    3. Quản lý Tài sản Số Thông minh (Smart Media / DAM):
        ◦ Tự động nén và chuyển đổi mọi ảnh tải lên sang định dạng WebP / AVIF theo nhiều kích thước (Thumbnail, Medium, Large).
        ◦ Quản lý thư mục Media và thẻ alt_text đa ngôn ngữ.
##Phân hệ 6: Mô-đun Thương mại Điện tử Lắp ghép (Pluggable E-Commerce)
**Mục tiêu: Kích hoạt ngay tính năng bán hàng chuyên nghiệp khi khách hàng có nhu cầu E-Commerce.**
    1. Quản lý Biến thể SKU & Tồn kho Chuẩn ACID:
        ◦ Tạo ma trận biến thể tự động (Màu sắc $\times$ Dung lượng/Kích cỡ), quản lý giá bán, giá vốn, trọng lượng và ảnh riêng cho từng SKU.
        ◦ Cơ chế giữ chỗ tồn kho (reserved_quantity) chống bán âm kho khi có nhiều người mua cùng lúc.
    2. Bộ lọc Sản phẩm Đa chiều (Dynamic Faceted Filtering):
        ◦ Kết hợp lọc theo thuộc tính động (Thương hiệu, Tính năng), lọc theo biến thể còn hàng (Màu, Size) và lọc theo khoảng giá kèm đếm số lượng trực tiếp.
    3. Giỏ hàng, Khuyến mãi & Quản lý Đơn hàng:
        ◦ Quản lý mã giảm giá (cms_ecommerce_promotions) theo %, số tiền cố định hoặc miễn phí vận chuyển.
        ◦ Lưu trữ đơn hàng và chụp cứng thông tin sản phẩm tại thời điểm mua (cms_ecommerce_order_items), tích hợp cổng thanh toán (VietQR, VNPay, MoMo) và đơn vị vận chuyển.
##Phân hệ 7: Trợ lý AI Tích hợp (AI-Native Capabilities)
**Mục tiêu: Tạo lợi thế cạnh tranh vượt trội và rút ngắn 80% thời gian vận hành nội dung.**
    1. AI Auto-Tagger cho Giao diện HTML: Hỗ trợ lập trình viên tự động gắn các thuộc tính data-cms-* vào file HTML tĩnh xuất từ Figma trước khi đưa vào bộ Parser.
    2. AI Content & SEO Co-pilot: Tự động viết bài chuẩn SEO từ từ khóa, tóm tắt bài viết, tự động viết thẻ Meta Title / Meta Description và tạo Alt-text mô tả hình ảnh.
    3. AI One-Click Translation: Dịch toàn bộ các trường trong localized_data và các khối trong cms_entry_blocks từ Tiếng Việt sang Tiếng Anh/Nhật/Hàn giữ nguyên định dạng HTML và ngữ cảnh ngành nghề.
Lộ trình Triển khai Dự án Đề xuất (3 Giai đoạn)
Để dự án về đích nhanh và sớm có sản phẩm chạy thực tế, bạn nên chia lộ trình phát triển làm 3 mốc (Milestones):
    • Giai đoạn 1 — Core Engine & Auto-Theme (4 – 6 tuần): Hoàn thành 15 bảng cốt lõi trên MSSQL 2022, bộ máy đọc file .zip HTML/CSS tự sinh Schema + Liquid Template, giao diện Admin tự động để nhập bài viết/trang đơn và hệ thống SEO cơ bản. (Kết thúc giai đoạn này đã có thể nhân bản hàng loạt web Doanh nghiệp, Tin tức, Landing Page).
    • Giai đoạn 2 — Dynamic Filter, RBAC & Multi-site (3 – 4 tuần): Hoàn thiện Stored Procedure Bộ lọc động đa chiều (usp_cms_dynamic_filter_entries), phân quyền chi tiết đến từng Field và quản lý đa tên miền. (Đáp ứng toàn bộ web Bất động sản, Tuyển dụng, Du lịch, Catalog sản phẩm lớn).
    • Giai đoạn 3 — Pluggable E-Commerce & AI Co-pilot (4 tuần): Kích hoạt 4 bảng Thương mại điện tử (SKU Variants, Giỏ hàng, Đơn hàng, Khuyến mãi) và tích hợp API AI hỗ trợ dịch thuật, viết bài tự động.

