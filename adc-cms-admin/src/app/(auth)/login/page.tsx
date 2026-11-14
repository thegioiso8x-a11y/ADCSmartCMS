'use client';
import { Button, Card, Form, Input, message, Typography } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';

const { Title } = Typography;

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((state) => state.setAuth);

  const onFinish = async (values: LoginForm) => {
    setLoading(true);
    try {
      const res = await api.post('/api/auth/login', values);
      const token = res.data.accessToken || res.data.token;
      if (token) {
        localStorage.setItem('access_token', token);
        setAuth(token, res.data); 
        message.success('Đăng nhập thành công');
        router.push('/dashboard'); 
      } else {
        message.error('Không nhận được token');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      message.error(err.response?.data?.error || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f0f2f5' }}>
      <Card style={{ width: 400 }}>
        <Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>ADC Smart CMS</Title>
        <Form name="login" onFinish={onFinish} size="large">
          <Form.Item name="email" rules={[{ required: true, message: 'Nhập email!' }, { type: 'email', message: 'Email không hợp lệ!' }]}>
            <Input prefix={<UserOutlined />} placeholder="Email" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: 'Nhập mật khẩu!' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>Đăng nhập</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
