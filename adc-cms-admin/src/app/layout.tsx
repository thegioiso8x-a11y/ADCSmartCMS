import type { Metadata } from "next";
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App, ConfigProvider } from 'antd';
import "./globals.css";

export const metadata: Metadata = {
  title: "Dynamic CMS",
  description: "HOMEDEN ENTERPRISE - Composable CMS Dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <AntdRegistry>
          <ConfigProvider
            theme={{
              token: {
                colorPrimary: '#2563eb',
                borderRadius: 8,
                fontFamily: "'Inter', 'Roboto', system-ui, sans-serif",
                colorBgLayout: '#f8fafc',
              },
              components: {
                Layout: {
                  siderBg: '#ffffff',
                  headerBg: '#ffffff',
                },
                Menu: {
                  itemSelectedBg: '#eff6ff',
                  itemSelectedColor: '#2563eb',
                  itemHeight: 44,
                  itemBorderRadius: 8,
                },
              },
            }}
          >
            <App>{children}</App>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}

