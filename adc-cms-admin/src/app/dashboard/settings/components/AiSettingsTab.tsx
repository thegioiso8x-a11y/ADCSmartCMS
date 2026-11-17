'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Form, Input, Select, Button, Space, Alert, Divider, Typography, Tag, Card, App, InputNumber, Switch, Spin,
} from 'antd';
import { RobotOutlined, ThunderboltOutlined, TranslationOutlined, SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';

const { Text, Paragraph } = Typography;

// ============================================================================
// Types (khớp DTO backend .NET)
// ============================================================================

interface AiSettingsFormValues {
  provider: string;
  apiKey?: string;
  defaultTextModel: string;
  defaultVisionModel: string;
  monthlyTokenLimit?: number | null;
  isEnabled: boolean;
}

/** GET/PUT /api/ai/settings/{siteId} -> AiSettingsDto */
interface AiSettingsDto {
  siteId: string;
  provider: string;
  apiKeyMasked?: string | null;
  defaultTextModel: string;
  defaultVisionModel: string;
  promptConfigs: string;
  monthlyTokenLimit?: number | null;
  tokensUsedThisMonth: number;
  isEnabled: boolean;
  updatedAt: string;
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
  const siteId = useAuthStore((state) => state.siteId);

  const [settingsForm] = Form.useForm<AiSettingsFormValues>();
  const [seoForm] = Form.useForm<SeoTestFormValues>();
  const [translateForm] = Form.useForm<TranslateTestFormValues>();

  const [settingsLoading, setSettingsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seoLoading, setSeoLoading] = useState(false);
  const [translateLoading, setTranslateLoading] = useState(false);
  const [seoResult, setSeoResult] = useState<AiSeoResult | null>(null);
  const [translateResult, setTranslateResult] = useState<AiTranslateResult | null>(null);

  /** Tải cấu hình AI (GET /api/ai/settings/{siteId}). */
  const loadSettings = useCallback(async () => {
    if (!siteId) return;
    setSettingsLoading(true);
    try {
      const res = await api.get<AiSettingsDto>(`/api/ai/settings/${siteId}`);
      const d = res.data;
      settingsForm.setFieldsValue({
        provider: d.provider,
        apiKey: d.apiKeyMasked ?? '',
        defaultTextModel: d.defaultTextModel,
        defaultVisionModel: d.defaultVisionModel,
        monthlyTokenLimit: d.monthlyTokenLimit ?? null,
        isEnabled: d.isEnabled,
      });
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string } } };
      if (e?.response?.status === 403) {
        message.error('Bạn không có quyền truy cập cấu hình AI (chỉ Super Admin).');
      } else {
        message.error(e?.response?.data?.error || 'Không tải được cấu hình AI');
      }
    } finally {
      setSettingsLoading(false);
    }
  }, [siteId, settingsForm, message]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  /** Lưu cấu hình AI (PUT /api/ai/settings/{siteId}). */
  const handleSaveSettings = async () => {
    if (!siteId) return;
    let values: AiSettingsFormValues;
    try {
      values = await settingsForm.validateFields();
    } catch {
      return;
    }

    setSaving(true);
    try {
      const res = await api.put<AiSettingsDto>(`/api/ai/settings/${siteId}`, {
        provider: values.provider,
        // Nếu user không sửa -> gửi masked key (BE tự bỏ qua vì chứa "...").
        apiKey: values.apiKey?.trim() || null,
        defaultTextModel: values.defaultTextModel?.trim() || null,
        defaultVisionModel: values.defaultVisionModel?.trim() || null,
        monthlyTokenLimit: values.monthlyTokenLimit ?? null,
        isEnabled: values.isEnabled,
      });
      const d = res.data;
      settingsForm.setFieldsValue({ apiKey: d.apiKeyMasked ?? '' });
      message.success('Lưu cấu hình AI thành công');
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string } } };
      if (e?.response?.status === 403) {
        message.error('Bạn không có quyền lưu cấu hình AI (chỉ Super Admin).');
      } else {
        message.error(e?.response?.data?.error || 'Lưu cấu hình AI thất bại');
      }
    } finally {
      setSaving(false);
    }
  };

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
        type="info"
        showIcon
        message="Cấu hình AI được lưu vào cms_ai_settings"
        description="API Key được mã hóa AES-256 ở Backend và chỉ trả về dạng masked (sk-...abcd). Chỉ Super Admin mới có quyền xem/sửa."
        className="rounded-xl"
      />

      {/* ---------- Form cấu hình AI ---------- */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <RobotOutlined className="text-indigo-600 text-xl" />
            <span className="font-bold text-lg text-slate-800">Cấu hình Trợ lý AI</span>
          </div>
          <Button icon={<ReloadOutlined />} onClick={loadSettings} loading={settingsLoading} className="rounded-lg">
            Tải lại
          </Button>
        </div>

        <Spin spinning={settingsLoading}>
          <Form form={settingsForm} layout="vertical" requiredMark="optional">
            <div className="grid grid-cols-2 gap-x-4">
              <Form.Item name="provider" label="Nhà cung cấp (Provider)">
                <Select options={PROVIDER_OPTIONS} className="w-full" />
              </Form.Item>
              <Form.Item name="defaultTextModel" label="Text Model">
                <Input placeholder="gemini-2.5-flash" className="rounded-lg font-mono" />
              </Form.Item>
            </div>

            <div className="grid grid-cols-2 gap-x-4">
              <Form.Item name="defaultVisionModel" label="Vision Model">
                <Input placeholder="gemini-2.5-flash" className="rounded-lg font-mono" />
              </Form.Item>
              <Form.Item name="monthlyTokenLimit" label="Giới hạn token / tháng">
                <InputNumber
                  className="w-full rounded-lg"
                  min={0}
                  style={{ width: '100%' }}
                  placeholder="Để trống = không giới hạn"
                />
              </Form.Item>
            </div>

            <Form.Item
              name="apiKey"
              label="API Key"
              extra="Key được mã hóa AES-256 khi lưu. Để nguyên giá trị masked nếu không muốn đổi key."
            >
              <Input.Password className="rounded-lg font-mono" placeholder="sk-..." />
            </Form.Item>

            <Form.Item name="isEnabled" label="Kích hoạt AI" valuePropName="checked">
              <Switch />
            </Form.Item>

            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSaveSettings}
              className="rounded-lg font-semibold shadow-sm shadow-indigo-200"
            >
              Lưu cấu hình
            </Button>
          </Form>
        </Spin>
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
