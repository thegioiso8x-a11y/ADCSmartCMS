'use client';
import React, { useEffect } from 'react';
import { Layout, Menu, Input, Badge, Avatar, Button } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined, FileTextOutlined, AppstoreOutlined, MenuOutlined,
  PictureOutlined, TeamOutlined, SettingOutlined,
  SearchOutlined, BellOutlined, ExportOutlined, LogoutOutlined,
  DatabaseOutlined, BuildOutlined, UserOutlined, SafetyCertificateOutlined,
  QuestionCircleOutlined, ShoppingCartOutlined, LayoutOutlined,
} from '@ant-design/icons';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';

const { Header, Sider, Content } = Layout;
type MenuItem = Required<MenuProps>['items'][number];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    if (!token && typeof window !== 'undefined' && !localStorage.getItem('access_token')) {
      router.push('/login');
    }
  }, [token, router]);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    logout();
    router.push('/login');
  };

  const menuItems: MenuItem[] = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
    {
      key: 'content-media',
      icon: <FileTextOutlined />,
      label: 'Nội dung & Media',
      children: [
        { key: '/dashboard/entries', icon: <FileTextOutlined />, label: 'Quản lý Nội dung' },
        { key: '/dashboard/media', icon: <PictureOutlined />, label: 'Thư viện Media' },
      ],
    },
    {
      key: 'structure-ui',
      icon: <AppstoreOutlined />,
      label: 'Cấu trúc & Giao diện',
      children: [
        { key: '/dashboard/content-types', icon: <DatabaseOutlined />, label: 'Cấu trúc dữ liệu' },
        { key: '/dashboard/themes', icon: <LayoutOutlined />, label: 'Quản lý Giao diện' },
        { key: '/dashboard/menus', icon: <MenuOutlined />, label: 'Quản lý Menu' },
        { key: '/dashboard/page-builder', icon: <BuildOutlined />, label: 'Page Builder' },
      ],
    },
    {
      key: 'commerce',
      icon: <ShoppingCartOutlined />,
      label: 'Thương mại',
      children: [
        { key: '/dashboard/ecommerce', icon: <ShoppingCartOutlined />, label: 'E-commerce' },
      ],
    },
    { key: '/dashboard/customers', icon: <TeamOutlined />, label: 'Khách hàng' },
    {
      key: 'system-security',
      icon: <SettingOutlined />,
      label: 'Hệ thống & Bảo mật',
      children: [
        { key: '/dashboard/settings', icon: <SettingOutlined />, label: 'Cài đặt (Settings)' },
        { key: '/dashboard/users', icon: <UserOutlined />, label: 'User Management' },
        { key: '/dashboard/rbac', icon: <SafetyCertificateOutlined />, label: 'Phân quyền (RBAC)' },
      ],
    },
    { key: '/dashboard/help', icon: <QuestionCircleOutlined />, label: 'Trợ giúp' },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={260}
        theme="light"
        className="border-r border-slate-200"
        style={{ backgroundColor: '#fff', position: 'fixed', height: '100vh', left: 0, zIndex: 10 }}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-slate-100">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center mr-3 shadow-md shadow-blue-200">
            <span className="text-white font-bold text-xl">D</span>
          </div>
          <div>
            <div className="font-bold text-lg leading-tight text-slate-800">Dynamic CMS</div>
            <div className="text-[11px] text-blue-400 font-semibold tracking-wider">HOMEDEN ENTERPRISE</div>
          </div>
        </div>

        {/* Menu */}
        <div className="py-4 overflow-y-auto" style={{ height: 'calc(100vh - 140px)' }}>
          <Menu
            mode="inline"
            selectedKeys={[pathname]}
            defaultOpenKeys={['content-media', 'structure-ui', 'commerce', 'system-security']}
            items={menuItems}
            className="border-e-0 font-medium"
            onClick={({ key }) => {
              if (key.startsWith('/')) router.push(key);
            }}
          />
        </div>

        {/* Bottom: user + logout */}
        <div className="absolute bottom-0 w-full p-4 border-t border-slate-100 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar style={{ backgroundColor: '#dbeafe', color: '#2563eb', fontWeight: 'bold' }}>A</Avatar>
              <div>
                <div className="text-sm font-semibold text-slate-700">admin</div>
                <div className="text-xs text-slate-400">admin@test.com</div>
              </div>
            </div>
            <Button type="text" danger icon={<LogoutOutlined />} onClick={handleLogout} title="Đăng xuất" />
          </div>
        </div>
      </Sider>

      <Layout style={{ marginLeft: 260 }}>
        {/* Header */}
        <Header
          className="bg-white border-b border-slate-200 flex items-center justify-between h-16 sticky top-0 z-50"
          style={{ padding: '0 24px' }}
        >
          <div className="w-96">
            <Input
              prefix={<SearchOutlined className="text-slate-400" />}
              placeholder="Tìm kiếm trang, nội dung..."
              className="rounded-full bg-slate-100 border-transparent hover:bg-slate-200 focus:bg-white focus:border-blue-400 shadow-sm transition-all"
              size="large"
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full border border-emerald-100">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-xs font-semibold text-emerald-600">System Ready</span>
            </div>
            <Button icon={<ExportOutlined />} className="font-medium">Xem Website</Button>
            <Badge dot color="red" offset={[-2, 2]}>
              <Button type="text" shape="circle" icon={<BellOutlined className="text-lg text-slate-600" />} className="hover:bg-slate-100" />
            </Badge>
          </div>
        </Header>

        {/* Content */}
        <Content className="bg-[#f8fafc] min-h-screen" style={{ padding: 24 }}>
          <div className="max-w-7xl mx-auto">{children}</div>
        </Content>
      </Layout>
    </Layout>
  );
}

