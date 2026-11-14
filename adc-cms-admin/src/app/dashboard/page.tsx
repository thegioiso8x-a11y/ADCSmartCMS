'use client';
import { Card, Row, Col, Button, Typography, Table, Tag, Progress } from 'antd';
import { FileTextOutlined, EyeOutlined, ShoppingCartOutlined, DollarOutlined, PlusOutlined, ArrowRightOutlined } from '@ant-design/icons';
import Link from 'next/link';

const { Title } = Typography;

export default function DashboardPage() {
  const recentEntries = [
    { key: '1', title: 'Ra mắt bộ sưu tập Thu Đông 2026', type: 'Bài viết', status: 'Published', date: '27/10/2026' },
    { key: '2', title: 'iPhone 16 Pro Max - Chính hãng VN/A', type: 'Sản phẩm', status: 'Published', date: '26/10/2026' },
    { key: '3', title: 'Căn hộ Vinhomes Grand Park - View sông', type: 'Bất động sản', status: 'Draft', date: '25/10/2026' },
  ];

  return (
    <div className="space-y-6">
      {/* Hero Banner - Đã xóa badge */}
      <div className="bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl shadow-indigo-200">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-white opacity-20 rounded-full blur-3xl mix-blend-overlay"></div>
        <div className="absolute bottom-0 left-10 -mb-10 w-40 h-40 bg-cyan-300 opacity-30 rounded-full blur-2xl mix-blend-overlay"></div>
        
        <div className="relative z-10 mt-2">
          <Title level={2} className="!text-white !mb-3 tracking-tight">Chào mừng trở lại, Quản trị viên!</Title>
          <p className="text-indigo-100 mb-8 max-w-2xl text-base font-medium">
            Quản lý cấu trúc dữ liệu động, xuất bản nội dung đa ngôn ngữ, và theo dõi hoạt động kinh doanh của bạn trên một nền tảng duy nhất.
          </p>
          <div className="flex gap-4">
            <Link href="/dashboard/entries">
              <Button size="large" icon={<PlusOutlined />} className="bg-white text-indigo-600 border-none font-bold rounded-xl hover:bg-indigo-50 hover:-translate-y-0.5 transition-all shadow-lg shadow-black/10">
                Tạo bài viết mới
              </Button>
            </Link>
            <Link href="/dashboard/content-types">
              <Button size="large" className="bg-white/10 text-white border-white/30 font-semibold rounded-xl hover:bg-white/20 backdrop-blur-md transition-all">
                Quản lý Schema
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <Row gutter={[24, 24]}>
        {[
          { title: 'TỔNG BÀI VIẾT', value: '1,248', desc: '+12% so với tháng trước', icon: <FileTextOutlined />, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { title: 'LƯỢT TRUY CẬP', value: '45.2K', desc: '+5.4% so với tuần trước', icon: <EyeOutlined />, color: 'text-blue-600', bg: 'bg-blue-50' },
          { title: 'ĐƠN HÀNG MỚI', value: '86', desc: '24 đơn chờ xử lý', icon: <ShoppingCartOutlined />, color: 'text-amber-600', bg: 'bg-amber-50' },
          { title: 'DOANH THU', value: '125M', desc: 'Đạt 78% mục tiêu tháng', icon: <DollarOutlined />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map((item, idx) => (
          <Col xs={24} sm={12} xl={6} key={idx}>
            <Card className="rounded-2xl shadow-sm border-slate-200 hover:shadow-md hover:-translate-y-1 transition-all duration-300 h-full">
              <div className="flex justify-between items-start mb-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${item.bg} ${item.color}`}>
                  {item.icon}
                </div>
              </div>
              <p className="text-xs font-bold text-slate-400 tracking-wider mb-1">{item.title}</p>
              <div className="text-3xl font-extrabold text-slate-800 mb-2">{item.value}</div>
              <p className="text-xs font-medium text-slate-500">{item.desc}</p>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Main Content Area */}
      <Row gutter={[24, 24]}>
        <Col xs={24} lg={16}>
          <Card className="rounded-2xl shadow-sm border-slate-200 h-full" title={<span className="font-bold text-lg">Nội dung mới cập nhật</span>} extra={<Link href="/dashboard/entries" className="text-indigo-600 font-medium">Xem tất cả <ArrowRightOutlined /></Link>}>
            <Table 
              dataSource={recentEntries} 
              pagination={false}
              className="ant-table-striped"
              columns={[
                { title: 'Tiêu đề', dataIndex: 'title', key: 'title', render: (text) => <span className="font-semibold text-slate-700">{text}</span> },
                { title: 'Loại', dataIndex: 'type', key: 'type', render: (text) => <Tag color="blue" className="rounded-md">{text}</Tag> },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (status) => (
                  <Tag color={status === 'Published' ? 'success' : 'default'} className="rounded-md font-medium">{status}</Tag>
                )},
                { title: 'Ngày', dataIndex: 'date', key: 'date', className: 'text-slate-500' },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card className="rounded-2xl shadow-sm border-slate-200 h-full" title={<span className="font-bold text-lg">Tài nguyên Hệ thống</span>}>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-sm mb-2"><span className="font-medium text-slate-600">Dung lượng Media</span><span className="font-bold text-indigo-600">45%</span></div>
                <Progress percent={45} showInfo={false} strokeColor="#4f46e5" trailColor="#e2e8f0" />
                <div className="text-xs text-slate-400 mt-1">4.5 GB / 10 GB</div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2"><span className="font-medium text-slate-600">Token AI tháng này</span><span className="font-bold text-blue-600">68%</span></div>
                <Progress percent={68} showInfo={false} strokeColor="#2563eb" trailColor="#e2e8f0" />
                <div className="text-xs text-slate-400 mt-1">680K / 1M Tokens</div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2"><span className="font-medium text-slate-600">Tài khoản nhân viên</span><span className="font-bold text-emerald-600">12 / 20</span></div>
                <Progress percent={60} showInfo={false} strokeColor="#059669" trailColor="#e2e8f0" />
                <div className="text-xs text-slate-400 mt-1">Còn 8 slot khả dụng</div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
