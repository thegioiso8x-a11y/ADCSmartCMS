'use client';

import React, { useState } from 'react';
import {
  Form, Input, Select, InputNumber, Button, Space, Alert, Divider, Typography, Tag, message, Card,
} from 'antd';
import { RobotOutlined, ThunderboltOutlined, TranslationOutlined } from '@ant-design/icons';
import api from '@/lib/api';

const { Text, Paragraph } = Typography;

// ============================================================================
// Types (khớp DTO backend .NET)
// ============================================================================

interface AiSettingsFormValues {
  provider: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

/** POST /api/ai/generate-seo -> AiSeoResult */
interface AiSeoResult {
  metaTitle: string;
  metaDescription: string;
  tags: string[];
  suggestedSlug: string;
  provider: string;
  isMock: boolean;
}

/** POST /api/ai/translate -> AiTranslateResult */
interface AiTranslateResult {
  translatedText: string;
  provider: string;
  isMock: boolean;
}

// ============================================================================
// Hằng số
// ============================================================================

const PROVIDER_OPTIONS = [
  { label: 'OpenAI (GPT)', value: 'openai' },
  { label: 'Google Gemini', value: 'gemini' },
  { label: 'Anthropic Claude', value: 'claude' },
  { label: 'Mock (nội bộ - test)', value: 'mock' },
];

const MODEL_OPTIONS = [
  { label: 'gpt-4o-mini', value: 'gpt-4o-mini' },
  { label: 'gpt-4o', value: 'gpt-4o' },
  { label: 'gemini-1.5-flash', value: 'gemini-1.5-flash' },
  { label: 'claude-3-5-sonnet', value: 'claude-3-5-sonnet' },
];

// ============================================================================
// Component
// ============================================================================

export default function AiSettingsTab() {
  const [form] = Form.useForm<AiSettingsFormValues>();

  const [testing, setTesting] = useState(false);
  const [seoResult, setSeoResult] = useState<AiSeoResult | null>(null);
  const [translateResult, setTranslateResult] = useState<AiTranslateResult | null>(null);

  /** Gọi API mock POST /api/ai/generate-seo để kiểm tra kết nối. */
  const handleTestSeo = async () => {
    setTesting(true);
    setSeoResult(null);
    try {
      const res = await api.post<AiSeoResult>('/api/ai/generate-seo', {
        title: 'ADC Smart CMS - Hệ thống quản trị nội dung tự động',
        content:
          'ADC Smart CMS giúp tự động hóa việc chuyển đổi giao diện HTML/CSS tĩnh thành website hoàn chỉnh, hỗ trợ đa ngôn ngữ và tối ưu SEO.',
      });
      setSeoResult(res.data);
      message.success('Test AI (SEO) thành công');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Test AI thất bại');
    } finally {
      setTesting(false);
    }
  };

  /** Gọi API mock POST /api/ai/translate để kiểm tra kết nối. */
  const handleTestTranslate = async () => {
    setTesting(true);
    setTranslateResult(null);
    try {
      const res = await api.post<AiTranslateResult>('/api/ai/translate', {
        text: 'Xin chào, đây là bản dịch thử nghiệm của ADC Smart CMS.',
        sourceLang: 'vi',
        targetLang: 'en',
      });
      setTranslateResult(res.data);
      message.success('Test AI (Translate) thành công');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Test AI thất bại');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Alert
        type="warning"
        showIcon
        message="Cấu hình AI hiện ở chế độ READ-ONLY"
        description="Backend chưa có endpoint lưu cms_ai_settings. Form dưới đây chỉ hiển thị giá trị mặc định; nút 'Test AI' gọi 2 API mock (/api/ai/generate-seo và /api/ai/translate)."
        className="rounded-xl"
      />

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <RobotOutlined className="text-indigo-600 text-xl" />
          <span className="font-bold text-lg text-slate-800">Cấu hình Trợ lý AI</span>
        </div>

        <Form
          form={form}
          layout="vertical"
          requiredMark="optional"
          disabled
          initialValues={{
            provider: 'mock',
            apiKey: 'sk-************************',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            maxTokens: 2048,
          }}
        >
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="provider" label="Nhà cung cấp (Provider)">
              <Select options={PROVIDER_OPTIONS} className="w-full" />
            </Form.Item>
            <Form.Item name="model" label="Model">
              <Select options={MODEL_OPTIONS} className="w-full" />
            </Form.Item>
          </div>

          <Form.Item name="apiKey" label="API Key" extra="Khóa được mã hóa khi lưu vào cms_ai_settings (chưa hỗ trợ).">
            <Input.Password className="rounded-lg font-mono" />
          </Form.Item>

          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="temperature" label="Temperature">
              <InputNumber min={0} max={2} step={0.1} className="w-full rounded-lg" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="maxTokens" label="Max Tokens">
              <InputNumber min={1} max={128000} step={256} className="w-full rounded-lg" style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>

        <Divider className="!my-4" />

        <Space wrap size="middle">
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            loading={testing}
            onClick={handleTestSeo}
            className="rounded-lg font-semibold shadow-sm shadow-indigo-200"
          >
            Test AI - Sinh SEO
          </Button>
          <Button
            icon={<TranslationOutlined />}
            loading={testing}
            onClick={handleTestTranslate}
            className="rounded-lg"
          >
            Test AI - Dịch thuật
          </Button>
        </Space>
      </div>

      {seoResult ? (
        <Card className="rounded-2xl shadow-sm border-slate-200" title={<span className="font-bold">Kết quả sinh SEO</span>}>
          <Space size={4} className="mb-3">
            <Tag color="blue" className="rounded-md">provider: {seoResult.provider}</Tag>
            {seoResult.isMock ? <Tag color="orange" className="rounded-md">MOCK</Tag> : null}
          </Space>
          <div className="space-y-2 text-sm">
            <div>
              <Text type="secondary">Meta Title: </Text>
              <Text strong>{seoResult.metaTitle}</Text>
            </div>
            <div>
              <Text type="secondary">Meta Description: </Text>
              <Text>{seoResult.metaDescription}</Text>
            </div>
            <div>
              <Text type="secondary">Suggested Slug: </Text>
              <Text code>{seoResult.suggestedSlug}</Text>
            </div>
            <div>
              <Text type="secondary">Tags: </Text>
              <Space size={4} wrap>
                {(seoResult.tags ?? []).map((t) => (
                  <Tag key={t} className="rounded-md">{t}</Tag>
                ))}
              </Space>
            </div>
          </div>
        </Card>
      ) : null}

      {translateResult ? (
        <Card className="rounded-2xl shadow-sm border-slate-200" title={<span className="font-bold">Kết quả dịch thuật</span>}>
          <Space size={4} className="mb-3">
            <Tag color="blue" className="rounded-md">provider: {translateResult.provider}</Tag>
            {translateResult.isMock ? <Tag color="orange" className="rounded-md">MOCK</Tag> : null}
          </Space>
          <Paragraph className="!mb-0 text-sm">{translateResult.translatedText}</Paragraph>
        </Card>
      ) : null}
    </div>
  );
}
