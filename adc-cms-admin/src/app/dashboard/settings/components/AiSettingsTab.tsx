'use client';

import React, { useState } from 'react';
import {
  Form, Input, Select, Button, Space, Alert, Divider, Typography, Tag, Card, App,
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

interface SeoTestFormValues {
  title: string;
  content: string;
}

interface TranslateTestFormValues {
  text: string;
  targetLang: string;
}

// ============================================================================
// Hằng số
// ============================================================================

const PROVIDER_OPTIONS = [
  { label: 'Google Gemini', value: 'gemini' },
  { label: 'OpenAI (GPT)', value: 'openai' },
  { label: 'Anthropic Claude', value: 'claude' },
];

const TARGET_LANG_OPTIONS = [
  { label: 'Tiếng Anh (en)', value: 'en' },
  { label: 'Tiếng Nhật (ja)', value: 'ja' },
  { label: 'Tiếng Hàn (ko)', value: 'ko' },
  { label: 'Tiếng Việt (vi)', value: 'vi' },
];

// ============================================================================
// Component
// ============================================================================

export default function AiSettingsTab() {
  const { message } = App.useApp();

  const [settingsForm] = Form.useForm<AiSettingsFormValues>();
  const [seoForm] = Form.useForm<SeoTestFormValues>();
  const [translateForm] = Form.useForm<TranslateTestFormValues>();

  const [seoLoading, setSeoLoading] = useState(false);
  const [translateLoading, setTranslateLoading] = useState(false);
  const [seoResult, setSeoResult] = useState<AiSeoResult | null>(null);
  const [translateResult, setTranslateResult] = useState<AiTranslateResult | null>(null);

  /** Gọi POST /api/ai/generate-seo với title + content người dùng nhập. */
  const handleTestSeo = async () => {
    let values: SeoTestFormValues;
    try {
      values = await seoForm.validateFields();
    } catch {
      return;
    }

    setSeoLoading(true);
    setSeoResult(null);
    try {
      const res = await api.post<AiSeoResult>('/api/ai/generate-seo', {
        title: values.title.trim(),
        content: values.content.trim(),
      });
      setSeoResult(res.data);
      message.success('Sinh SEO thành công');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Gọi API sinh SEO thất bại');
    } finally {
      setSeoLoading(false);
    }
  };

  /** Gọi POST /api/ai/translate với text + targetLang người dùng nhập. */
  const handleTestTranslate = async () => {
    let values: TranslateTestFormValues;
    try {
      values = await translateForm.validateFields();
    } catch {
      return;
    }

    setTranslateLoading(true);
    setTranslateResult(null);
    try {
      const res = await api.post<AiTranslateResult>('/api/ai/translate', {
        text: values.text.trim(),
        sourceLang: 'vi',
        targetLang: values.targetLang,
      });
      setTranslateResult(res.data);
      message.success('Dịch thuật thành công');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Gọi API dịch thuật thất bại');
    } finally {
      setTranslateLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Alert
        type="warning"
        showIcon
        message="Cấu hình AI hiện ở chế độ READ-ONLY"
        description="Backend chưa có endpoint lưu cms_ai_settings. Form cấu hình chỉ hiển thị giá trị mặc định; 2 Card bên dưới gọi API mock (/api/ai/generate-seo và /api/ai/translate)."
        className="rounded-xl"
      />

      {/* ---------- Form cấu hình AI (read-only) ---------- */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <RobotOutlined className="text-indigo-600 text-xl" />
          <span className="font-bold text-lg text-slate-800">Cấu hình Trợ lý AI</span>
        </div>

        <Form
          form={settingsForm}
          layout="vertical"
          requiredMark="optional"
          disabled
          initialValues={{
            provider: 'gemini',
            apiKey: 'sk-************************',
            model: 'gemini-1.5-flash',
          }}
        >
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="provider" label="Nhà cung cấp (Provider)">
              <Select options={PROVIDER_OPTIONS} className="w-full" />
            </Form.Item>
            <Form.Item name="model" label="Text Model">
              <Input placeholder="gemini-1.5-flash" className="rounded-lg font-mono" />
            </Form.Item>
          </div>

          <Form.Item
            name="apiKey"
            label="API Key"
            extra="Khóa được mã hóa khi lưu vào cms_ai_settings (chưa hỗ trợ)."
          >
            <Input.Password className="rounded-lg font-mono" />
          </Form.Item>
        </Form>
      </div>

      {/* ---------- Khu vực Test AI: 2 Card ---------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 1: Test Sinh SEO */}
        <Card
          className="rounded-2xl shadow-sm border-slate-200"
          title={
            <span className="font-bold flex items-center gap-2">
              <ThunderboltOutlined className="text-indigo-600" />
              Test Sinh SEO
            </span>
          }
        >
          <Form form={seoForm} layout="vertical" requiredMark="optional">
            <Form.Item
              name="title"
              label="Tiêu đề (title)"
              rules={[{ required: true, message: 'Vui lòng nhập tiêu đề' }]}
            >
              <Input placeholder="ADC Smart CMS - Quản trị nội dung tự động" className="rounded-lg" />
            </Form.Item>
            <Form.Item
              name="content"
              label="Nội dung (content)"
              rules={[{ required: true, message: 'Vui lòng nhập nội dung' }]}
            >
              <Input.TextArea
                rows={4}
                placeholder="Mô tả nội dung bài viết để AI sinh meta SEO..."
                className="rounded-lg"
              />
            </Form.Item>
        </Form>

          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            loading={seoLoading}
            onClick={handleTestSeo}
            className="rounded-lg font-semibold shadow-sm shadow-indigo-200"
          >
            Generate
          </Button>

          {seoResult ? (
            <>
              <Divider className="!my-4" />
              <Space size={4} className="mb-2">
                <Tag color="blue" className="rounded-md">provider: {seoResult.provider}</Tag>
                {seoResult.isMock ? <Tag color="orange" className="rounded-md">MOCK</Tag> : null}
              </Space>
              <div className="space-y-2 text-sm mb-3">
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
              <div className="text-xs text-slate-500 mb-1">JSON kết quả:</div>
              <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs overflow-auto max-h-56">
                {JSON.stringify(seoResult, null, 2)}
              </pre>
            </>
          ) : null}
        </Card>

        {/* Card 2: Test Dịch thuật */}
        <Card
          className="rounded-2xl shadow-sm border-slate-200"
          title={
            <span className="font-bold flex items-center gap-2">
              <TranslationOutlined className="text-indigo-600" />
              Test Dịch thuật
            </span>
          }
        >
          <Form form={translateForm} layout="vertical" requiredMark="optional">
            <Form.Item
              name="text"
              label="Văn bản cần dịch (text)"
              rules={[{ required: true, message: 'Vui lòng nhập văn bản' }]}
            >
              <Input.TextArea
                rows={4}
                placeholder="Xin chào, đây là bản dịch thử nghiệm của ADC Smart CMS."
                className="rounded-lg"
              />
            </Form.Item>
            <Form.Item
              name="targetLang"
              label="Ngôn ngữ đích (targetLang)"
              rules={[{ required: true, message: 'Vui lòng chọn ngôn ngữ đích' }]}
            >
              <Select options={TARGET_LANG_OPTIONS} className="w-full" placeholder="Chọn ngôn ngữ" />
            </Form.Item>
          </Form>

          <Button
            icon={<TranslationOutlined />}
            loading={translateLoading}
            onClick={handleTestTranslate}
            className="rounded-lg"
          >
            Translate
          </Button>

          {translateResult ? (
            <>
              <Divider className="!my-4" />
              <Space size={4} className="mb-2">
                <Tag color="blue" className="rounded-md">provider: {translateResult.provider}</Tag>
                {translateResult.isMock ? <Tag color="orange" className="rounded-md">MOCK</Tag> : null}
              </Space>
              <Paragraph className="!mb-3 text-sm">{translateResult.translatedText}</Paragraph>
              <div className="text-xs text-slate-500 mb-1">JSON kết quả:</div>
              <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs overflow-auto max-h-56">
                {JSON.stringify(translateResult, null, 2)}
              </pre>
            </>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
